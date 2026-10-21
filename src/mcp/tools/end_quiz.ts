import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Database from 'better-sqlite3';
import { endQuiz } from '../../services/quiz.js';

export const endQuizSchema = {
  sessionId: z.string().describe("Active quiz session ID to terminate early")
};

export function registerEndQuizTool(server: McpServer, db: Database.Database) {
  server.tool(
    'end_quiz',
    "End an active quiz session immediately and return a summary of questions answered and scores.",
    endQuizSchema,
    async ({ sessionId }) => {
      try {
        if (!sessionId) {
          return {
            content: [{ type: 'text', text: "Session ID is required." }],
            isError: true
          };
        }

        const summary = endQuiz(db, sessionId);

        return {
          content: [{ type: 'text', text: summary.spokenSummary }],
          structuredContent: {
            sessionId: summary.sessionId,
            totalQuestions: summary.totalQuestions,
            answeredQuestions: summary.answeredQuestions,
            averageScore: summary.averageScore
          }
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Failed to end quiz: ${(err as Error).message}` }],
          isError: true
        };
      }
    }
  );
}
