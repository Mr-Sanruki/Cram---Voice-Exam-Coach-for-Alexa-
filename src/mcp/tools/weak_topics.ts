import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Database from 'better-sqlite3';
import { getWeakTopics } from '../../services/srs.js';
import { ExamRow } from '../../db/db.js';

export const weakTopicsSchema = {
  examId: z.number().describe("ID of the exam to evaluate")
};

export function registerWeakTopicsTool(server: McpServer, db: Database.Database) {
  server.tool(
    'weak_topics',
    "List the most critical topics needing review for an exam, sorted by lowest mastery score and overdue status.",
    weakTopicsSchema,
    async ({ examId }) => {
      try {
        const examStmt = db.prepare<[number], ExamRow>(`SELECT * FROM exams WHERE id = ?`);
        const exam = examStmt.get(examId);

        if (!exam) {
          return {
            content: [{ type: 'text', text: `Exam with ID ${examId} not found.` }],
            isError: true
          };
        }

        const weak = getWeakTopics(db, examId);

        if (weak.length === 0) {
          return {
            content: [{ type: 'text', text: `No topics have been added for ${exam.subject} yet.` }],
            structuredContent: { weakTopics: [] }
          };
        }

        const topWeak = weak.slice(0, 3);
        const topicNames = topWeak.map((t) => `${t.name} at ${t.masteryScore}% mastery`);
        const voiceReply = `Your weakest topics in ${exam.subject} are ${topicNames.join(', ')}. Say "quiz me on ${topWeak[0].name}" to strengthen your recall.`;

        return {
          content: [{ type: 'text', text: voiceReply }],
          structuredContent: {
            examId,
            subject: exam.subject,
            totalTopics: weak.length,
            weakTopics: weak.map((t) => ({
              topicId: t.topicId,
              name: t.name,
              masteryScore: t.masteryScore,
              dueDate: t.dueDate,
              isOverdue: t.isOverdue
            }))
          }
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Failed to find weak topics: ${(err as Error).message}` }],
          isError: true
        };
      }
    }
  );
}
