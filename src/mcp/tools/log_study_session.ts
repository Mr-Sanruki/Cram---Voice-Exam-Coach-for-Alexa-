import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Database from 'better-sqlite3';
import { ExamRow, TopicRow } from '../../db/db.js';

export const logStudySessionSchema = {
  examId: z.number().describe("ID of the exam"),
  topic: z.string().describe("Topic name that was studied"),
  minutes: z.number().describe("Number of minutes spent studying")
};

export function registerLogStudySessionTool(server: McpServer, db: Database.Database) {
  server.tool(
    'log_study_session',
    "Log self-study time for a specific exam topic to update study streaks and analytics.",
    logStudySessionSchema,
    async ({ examId, topic, minutes }) => {
      try {
        const examStmt = db.prepare<[number], ExamRow>(`SELECT * FROM exams WHERE id = ?`);
        const exam = examStmt.get(examId);

        if (!exam) {
          return {
            content: [{ type: 'text', text: `Exam with ID ${examId} not found.` }],
            isError: true
          };
        }

        if (minutes <= 0) {
          return {
            content: [{ type: 'text', text: "Please log a positive number of minutes." }],
            isError: true
          };
        }

        // Find or create topic
        let topicStmt = db.prepare<[number, string], TopicRow>(`
          SELECT * FROM topics WHERE exam_id = ? AND lower(name) = lower(?)
        `);
        let topicRow = topicStmt.get(examId, topic.trim());

        if (!topicRow) {
          const insertTopic = db.prepare(`
            INSERT INTO topics (exam_id, name) VALUES (?, ?)
          `);
          const res = insertTopic.run(examId, topic.trim());
          const newTopicId = Number(res.lastInsertRowid);
          topicRow = {
            id: newTopicId,
            exam_id: examId,
            name: topic.trim(),
            created_at: new Date().toISOString()
          };
        }

        const logStmt = db.prepare(`
          INSERT INTO study_logs (exam_id, topic_id, minutes) VALUES (?, ?, ?)
        `);
        logStmt.run(examId, topicRow.id, minutes);

        const voiceReply = `Logged ${minutes} minutes of study for ${topicRow.name} in ${exam.subject}. Keep up the great work!`;

        return {
          content: [{ type: 'text', text: voiceReply }],
          structuredContent: {
            examId,
            subject: exam.subject,
            topic: topicRow.name,
            minutesStudied: minutes
          }
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Failed to log study session: ${(err as Error).message}` }],
          isError: true
        };
      }
    }
  );
}
