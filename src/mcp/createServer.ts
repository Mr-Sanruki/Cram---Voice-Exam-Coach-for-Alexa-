import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Database from 'better-sqlite3';

// Tools
import { registerAddExamTool } from './tools/add_exam.js';
import { registerListExamsTool } from './tools/list_exams.js';
import { registerAddTopicsTool } from './tools/add_topics.js';
import { registerMakeStudyPlanTool } from './tools/make_study_plan.js';
import { registerGetTodayPlanTool } from './tools/get_today_plan.js';
import { registerStartQuizTool } from './tools/start_quiz.js';
import { registerAnswerQuestionTool } from './tools/answer_question.js';
import { registerEndQuizTool } from './tools/end_quiz.js';
import { registerGetProgressTool } from './tools/get_progress.js';
import { registerLogStudySessionTool } from './tools/log_study_session.js';
import { registerWeakTopicsTool } from './tools/weak_topics.js';

// DB helpers
import { calculateStreak } from '../db/db.js';

/**
 * Creates and configures a new McpServer instance with all Cram tools,
 * resources, and prompts registered.
 */
export function createCramMcpServer(db: Database.Database): McpServer {
  const server = new McpServer({
    name: 'cram',
    version: '1.0.0'
  });

  // 1. Register all 11 MCP Tools
  registerAddExamTool(server, db);
  registerListExamsTool(server, db);
  registerAddTopicsTool(server, db);
  registerMakeStudyPlanTool(server, db);
  registerGetTodayPlanTool(server, db);
  registerStartQuizTool(server, db);
  registerAnswerQuestionTool(server, db);
  registerEndQuizTool(server, db);
  registerGetProgressTool(server, db);
  registerLogStudySessionTool(server, db);
  registerWeakTopicsTool(server, db);

  // 2. Expose MCP Resource: cram://progress/summary
  server.resource(
    'cram_progress_summary',
    'cram://progress/summary',
    async (uri) => {
      const streak = calculateStreak(db);
      const examsStmt = db.prepare(`SELECT count(*) as count FROM exams`);
      const examCount = (examsStmt.get() as any)?.count || 0;

      const topicsStmt = db.prepare(`
        SELECT
          e.subject,
          t.name as topic_name,
          coalesce(s.mastery_score, 0) as mastery_score
        FROM topics t
        JOIN exams e ON t.exam_id = e.id
        LEFT JOIN srs_items s ON t.id = s.topic_id
        ORDER BY e.subject, s.mastery_score ASC
      `);
      const topics = topicsStmt.all() as Array<{ subject: string; topic_name: string; mastery_score: number }>;

      const logsStmt = db.prepare(`SELECT coalesce(sum(minutes), 0) as total FROM study_logs`);
      const totalMinutes = (logsStmt.get() as any)?.total || 0;

      const summaryLines = [
        `=== CRAM PROGRESS SUMMARY ===`,
        `Study Streak: ${streak} day(s)`,
        `Total Study Time: ${totalMinutes} minutes`,
        `Exams Tracked: ${examCount}`,
        `Topics Tracked: ${topics.length}`,
        ``,
        `Topic Mastery:`
      ];

      for (const t of topics) {
        summaryLines.push(`- [${t.subject}] ${t.topic_name}: ${t.mastery_score}%`);
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/plain',
            text: summaryLines.join('\n')
          }
        ]
      };
    }
  );

  // 3. Expose MCP Prompt: exam_coach
  server.prompt(
    'exam_coach',
    "System persona: friendly, concise, voice-friendly answers under 2 sentences for Alexa+",
    {},
    async () => {
      return {
        messages: [
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: "You are Cram, an expert oral exam coach for Alexa+. You help students retain high-yield academic material using active recall and spaced repetition. Speak clearly, concisely, and supportively. Always keep answers under 2 sentences, formatted for natural text-to-speech."
            }
          }
        ]
      };
    }
  );

  return server;
}
