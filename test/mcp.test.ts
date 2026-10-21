import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';

describe('MCP Streamable HTTP Integration Test', () => {
  let server: Server;
  let serverUrl: string;
  let client: Client;
  let transport: StreamableHTTPClientTransport;

  beforeAll(async () => {
    // Spin up Express app with an in-memory database
    const { app } = createApp(':memory:');

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Connect official MCP Client over Streamable HTTP
    transport = new StreamableHTTPClientTransport(new URL(`${serverUrl}/mcp`), {
      requestInit: {
        headers: {
          Origin: serverUrl
        }
      }
    });

    client = new Client(
      { name: 'integration-test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
  });

  afterAll(async () => {
    if (client) {
      await client.close();
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('lists all 11 registered MCP tools', async () => {
    const result = await client.listTools();
    expect(result.tools).toBeDefined();

    const toolNames = result.tools.map((t) => t.name);
    const requiredTools = [
      'add_exam',
      'list_exams',
      'add_topics',
      'make_study_plan',
      'get_today_plan',
      'start_quiz',
      'answer_question',
      'end_quiz',
      'get_progress',
      'log_study_session',
      'weak_topics'
    ];

    for (const tool of requiredTools) {
      expect(toolNames).toContain(tool);
    }
  });

  it('calls add_exam and creates exam with syllabus topics', async () => {
    const result = (await client.callTool({
      name: 'add_exam',
      arguments: {
        subject: 'DSGT',
        examDate: '2026-11-20',
        topics: ['Graph Theory', 'Trees', 'Propositional Logic']
      }
    })) as any;

    expect(result.content).toBeDefined();
    expect(result.content[0].text).toContain('DSGT');
    expect(result.content[0].text).toContain('3 topics');
    expect(result.structuredContent.examId).toBe(1);
    expect(result.structuredContent.topicCount).toBe(3);
  });

  let activeSessionId = '';

  it('calls start_quiz and receives the first spoken question', async () => {
    const result = (await client.callTool({
      name: 'start_quiz',
      arguments: {
        examId: 1,
        topic: 'Graph Theory',
        minutes: 10
      }
    })) as any;

    expect(result.content).toBeDefined();
    expect(result.content[0].text).toContain('Graph Theory');
    expect(result.structuredContent.sessionId).toBeDefined();
    expect(result.structuredContent.questionText.length).toBeGreaterThan(10);

    activeSessionId = result.structuredContent.sessionId;
  });

  it('calls answer_question, grades the answer, and updates SRS state', async () => {
    expect(activeSessionId).toBeTruthy();

    const result = (await client.callTool({
      name: 'answer_question',
      arguments: {
        sessionId: activeSessionId,
        answer: 'An Eulerian path visits every edge exactly once, while a Hamiltonian path visits every vertex exactly once.'
      }
    })) as any;

    expect(result.content).toBeDefined();
    expect(result.structuredContent.score).toBeGreaterThanOrEqual(0);
    expect(result.structuredContent.feedback).toBeDefined();
    expect(result.content[0].text.length).toBeGreaterThan(10);
  });

  it('calls get_progress and verifies updated study metrics', async () => {
    const result = (await client.callTool({
      name: 'get_progress',
      arguments: { examId: 1 }
    })) as any;

    expect(result.content).toBeDefined();
    expect(result.structuredContent.totalTopics).toBe(3);
    expect(result.structuredContent.topics.length).toBe(3);
    // Verified minutes logged during quiz answer
    expect(result.structuredContent.totalMinutesStudied).toBeGreaterThanOrEqual(2);
  });
});
