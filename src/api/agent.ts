import { Request, Response, Router } from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { llm, AgentChatMessage, AgentToolDeclaration } from '../services/llm.js';
import Database from 'better-sqlite3';
import { calculateStreak, ExamRow } from '../db/db.js';

export interface AgentRequestPayload {
  utterance: string;
  history?: AgentChatMessage[];
  activeQuizSessionId?: string;
}

export interface ToolCallRecord {
  tool: string;
  arguments: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  timestamp: string;
}

export function createAgentRouter(db: Database.Database): Router {
  const router = Router();

  /**
   * POST /api/agent
   * Main conversational endpoint: acts as an MCP Client over Streamable HTTP.
   */
  router.post('/agent', async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { utterance, history = [], activeQuizSessionId } = req.body as AgentRequestPayload;

    if (!utterance || !utterance.trim()) {
      res.status(400).json({ error: "Missing 'utterance' field." });
      return;
    }

    const port = process.env.PORT || 3000;
    const mcpUrl = new URL(`http://localhost:${port}/mcp`);

    // Prepare headers for the MCP Client
    const headers: Record<string, string> = {
      'Origin': `http://localhost:${port}`
    };
    if (process.env.MCP_AUTH_TOKEN?.trim()) {
      headers['Authorization'] = `Bearer ${process.env.MCP_AUTH_TOKEN.trim()}`;
    }

    let client: Client | null = null;
    const toolCallsTrace: ToolCallRecord[] = [];

    try {
      // 1. Connect real MCP Client to self-hosted /mcp endpoint
      const clientTransport = new StreamableHTTPClientTransport(mcpUrl, {
        requestInit: { headers }
      });

      client = new Client(
        { name: 'cram-alexa-simulator', version: '1.0.0' },
        { capabilities: {} }
      );

      await client.connect(clientTransport);

      // 2. Discover available tools from the MCP server
      const toolsResult = await client.listTools();
      const availableTools: AgentToolDeclaration[] = toolsResult.tools.map((t) => ({
        name: t.name,
        description: t.description || '',
        inputSchema: (t.inputSchema as Record<string, unknown>) || {}
      }));

      // 3. Check if this is an answer to an ongoing quiz
      let chosenToolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];

      if (activeQuizSessionId) {
        // Direct route to answer_question if user is in an active quiz
        // Check if session is indeed active
        const sessStmt = db.prepare(`SELECT status FROM quiz_sessions WHERE id = ?`);
        const sess = sessStmt.get(activeQuizSessionId) as { status: string } | undefined;
        if (sess && sess.status === 'active') {
          chosenToolCalls = [
            {
              name: 'answer_question',
              arguments: {
                sessionId: activeQuizSessionId,
                answer: utterance.trim()
              }
            }
          ];
        }
      }

      // 4. If not a direct quiz answer, run LLM tool selector
      let finalSpokenReply = '';

      if (chosenToolCalls.length === 0) {
        const messages: AgentChatMessage[] = [
          ...history,
          { role: 'user', content: utterance }
        ];
        const chatDecision = await llm.agentChat(messages, availableTools);

        if (chatDecision.toolCalls && chatDecision.toolCalls.length > 0) {
          chosenToolCalls = chatDecision.toolCalls;
        } else if (chatDecision.reply) {
          finalSpokenReply = chatDecision.reply;
        }
      }

      // 5. Execute chosen MCP tool calls through the MCP client
      if (chosenToolCalls.length > 0) {
        for (const tc of chosenToolCalls) {
          const t0 = Date.now();
          const toolResult = await client.callTool({
            name: tc.name,
            arguments: tc.arguments
          });
          const elapsed = Date.now() - t0;

          toolCallsTrace.push({
            tool: tc.name,
            arguments: tc.arguments,
            result: toolResult,
            durationMs: elapsed,
            timestamp: new Date().toISOString()
          });

          // Extract voice text from tool result
          const content = (toolResult as any).content;
          if (Array.isArray(content) && content.length > 0 && content[0].text) {
            finalSpokenReply = content[0].text;
          }
        }
      }

      if (!finalSpokenReply) {
        finalSpokenReply = "I've updated your exam study data.";
      }

      // 6. Cleanly close the MCP Client session
      await client.close();
      client = null;

      res.json({
        spokenReply: finalSpokenReply,
        toolCalls: toolCallsTrace,
        totalTimeMs: Date.now() - startTime
      });
    } catch (err) {
      console.error('Agent error:', err);
      if (client) {
        try { await client.close(); } catch {}
      }
      res.status(500).json({
        error: (err as Error).message,
        toolCalls: toolCallsTrace
      });
    }
  });

  /**
   * GET /api/dashboard
   * Provides data for the student dashboard tab.
   */
  router.get('/dashboard', (req: Request, res: Response) => {
    try {
      const streak = calculateStreak(db);

      // Exams
      const examsStmt = db.prepare<[], ExamRow & { topic_count: number }>(`
        SELECT
          e.id,
          e.subject,
          e.exam_date,
          e.created_at,
          (SELECT count(*) FROM topics t WHERE t.exam_id = e.id) as topic_count
        FROM exams e
        ORDER BY e.exam_date ASC
      `);
      const exams = examsStmt.all().map((e) => {
        const now = new Date();
        const diff = new Date(e.exam_date).getTime() - now.getTime();
        const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
        return {
          ...e,
          daysLeft
        };
      });

      // Topics with mastery
      const topicsStmt = db.prepare(`
        SELECT
          t.id as topic_id,
          t.name,
          e.id as exam_id,
          e.subject,
          coalesce(s.mastery_score, 0) as mastery_score,
          coalesce(s.interval_days, 0) as interval_days,
          coalesce(s.repetitions, 0) as repetitions,
          coalesce(s.due_date, date('now')) as due_date
        FROM topics t
        JOIN exams e ON t.exam_id = e.id
        LEFT JOIN srs_items s ON t.id = s.topic_id
        ORDER BY e.subject ASC, mastery_score ASC
      `);
      const topics = topicsStmt.all();

      // Today's plan
      const todayStr = new Date().toISOString().slice(0, 10);
      const planStmt = db.prepare(`
        SELECT sp.id, sp.exam_id, e.subject, sp.tasks_json, sp.hours_allocated
        FROM study_plans sp
        JOIN exams e ON sp.exam_id = e.id
        WHERE sp.plan_date = ?
      `);
      const plans = planStmt.all(todayStr).map((p: any) => ({
        ...p,
        tasks: JSON.parse(p.tasks_json || '[]')
      }));

      // Total study minutes
      const logsStmt = db.prepare(`SELECT coalesce(sum(minutes), 0) as total FROM study_logs`);
      const totalMinutes = (logsStmt.get() as any)?.total || 0;

      // Recent quiz sessions
      const quizStmt = db.prepare(`
        SELECT qs.*, e.subject, t.name as topic_name
        FROM quiz_sessions qs
        JOIN exams e ON qs.exam_id = e.id
        LEFT JOIN topics t ON qs.topic_id = t.id
        ORDER BY qs.started_at DESC LIMIT 5
      `);
      const recentQuizzes = quizStmt.all();

      res.json({
        streak,
        totalMinutes,
        exams,
        topics,
        todayPlans: plans,
        recentQuizzes
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
