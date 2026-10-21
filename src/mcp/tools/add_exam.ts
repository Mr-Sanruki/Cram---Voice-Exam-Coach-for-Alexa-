import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Database from 'better-sqlite3';

export const addExamSchema = {
  subject: z.string().describe("Subject name of the exam, e.g. 'DSGT' or 'Algorithms'"),
  examDate: z.string().describe("Date of the exam in YYYY-MM-DD or ISO 8601 format, e.g. '2026-11-15'"),
  topics: z.array(z.string()).optional().describe("Optional initial list of topic names to prepare for this exam")
};

export function registerAddExamTool(server: McpServer, db: Database.Database) {
  server.tool(
    'add_exam',
    "Add a new upcoming exam with its target date and optional syllabus topics.",
    addExamSchema,
    async ({ subject, examDate, topics }) => {
      try {
        if (!subject || !subject.trim()) {
          return {
            content: [{ type: 'text', text: "Please provide a valid subject name for the exam." }],
            isError: true
          };
        }

        // Validate date
        const parsedDate = new Date(examDate);
        if (isNaN(parsedDate.getTime())) {
          return {
            content: [{ type: 'text', text: `Invalid exam date "${examDate}". Please provide a date like 2026-11-15.` }],
            isError: true
          };
        }

        const dateStr = parsedDate.toISOString().slice(0, 10);

        // Insert exam
        const insertExam = db.prepare(`
          INSERT INTO exams (subject, exam_date) VALUES (?, ?)
        `);
        const result = insertExam.run(subject.trim(), dateStr);
        const examId = Number(result.lastInsertRowid);

        let topicCount = 0;
        if (topics && topics.length > 0) {
          const insertTopic = db.prepare(`
            INSERT OR IGNORE INTO topics (exam_id, name) VALUES (?, ?)
          `);
          const insertSrs = db.prepare(`
            INSERT OR IGNORE INTO srs_items (exam_id, topic_id, ease_factor, interval_days, repetitions, mastery_score, due_date)
            VALUES (?, ?, 2.5, 0, 0, 0, ?)
          `);

          const insertMany = db.transaction((topicList: string[]) => {
            for (const t of topicList) {
              const name = t.trim();
              if (name) {
                const tr = insertTopic.run(examId, name);
                const topicId = Number(tr.lastInsertRowid);
                if (topicId) {
                  insertSrs.run(examId, topicId, dateStr);
                  topicCount++;
                }
              }
            }
          });

          insertMany(topics);
        }

        const today = new Date();
        const daysLeft = Math.ceil((parsedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const daysMsg = daysLeft > 0 ? `in ${daysLeft} days` : `today`;

        const voiceReply = topicCount > 0
          ? `Added your ${subject} exam on ${dateStr}, which is ${daysMsg}, with ${topicCount} topics.`
          : `Added your ${subject} exam on ${dateStr}, which is ${daysMsg}. Say "add topics" to list syllabus areas.`;

        return {
          content: [{ type: 'text', text: voiceReply }],
          structuredContent: {
            examId,
            subject,
            examDate: dateStr,
            daysLeft,
            topicCount
          }
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Failed to add exam: ${(err as Error).message}` }],
          isError: true
        };
      }
    }
  );
}
