import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Database from 'better-sqlite3';
import { answerQuestion } from '../../services/quiz.js';

export const answerQuestionSchema = {
  sessionId: z.string().describe("Active quiz session ID returned by start_quiz"),
  answer: z.string().describe("Spoken or typed student response to the current exam question")
};

export function registerAnswerQuestionTool(server: McpServer, db: Database.Database) {
  server.tool(
    'answer_question',
    "Submit the student's answer for real-time grading, SRS mastery update, and receive next question or completion summary.",
    answerQuestionSchema,
    async ({ sessionId, answer }) => {
      try {
        if (!sessionId || !sessionId.trim()) {
          return {
            content: [{ type: 'text', text: "Session ID is required to answer a question." }],
            isError: true
          };
        }

        if (!answer || !answer.trim()) {
          return {
            content: [{ type: 'text', text: "Please provide an answer to evaluate." }],
            isError: true
          };
        }

        const result = await answerQuestion(db, sessionId, answer);

        return {
          content: [{ type: 'text', text: result.spokenReply }],
          structuredContent: {
            sessionId: result.sessionId,
            isComplete: result.isComplete,
            score: result.score,
            feedback: result.feedback,
            correctAnswer: result.correctAnswer,
            nextQuestion: result.nextQuestion,
            summary: result.summary
          }
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error evaluating answer: ${(err as Error).message}` }],
          isError: true
        };
      }
    }
  );
}
