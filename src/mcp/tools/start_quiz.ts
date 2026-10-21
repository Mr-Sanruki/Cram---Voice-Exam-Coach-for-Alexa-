import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Database from 'better-sqlite3';
import { startQuiz } from '../../services/quiz.js';

export const startQuizSchema = {
  examId: z.number().describe("ID of the exam to quiz on"),
  topic: z.string().optional().describe("Optional specific topic name. If omitted, the weakest or most overdue topic is selected."),
  minutes: z.number().optional().describe("Target duration of the quiz in minutes (default 10)")
};

export function registerStartQuizTool(server: McpServer, db: Database.Database) {
  server.tool(
    'start_quiz',
    "Start an oral voice quiz session on an exam topic, returning the first spoken question and a session ID.",
    startQuizSchema,
    async ({ examId, topic, minutes = 10 }) => {
      try {
        const quiz = await startQuiz(db, examId, topic, minutes);

        return {
          content: [{ type: 'text', text: quiz.spokenPrompt }],
          structuredContent: {
            sessionId: quiz.sessionId,
            examId: quiz.examId,
            subject: quiz.subject,
            topicId: quiz.topicId,
            topicName: quiz.topicName,
            durationMinutes: quiz.durationMinutes,
            questionNumber: quiz.questionNumber,
            questionText: quiz.questionText
          }
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Failed to start quiz: ${(err as Error).message}` }],
          isError: true
        };
      }
    }
  );
}
