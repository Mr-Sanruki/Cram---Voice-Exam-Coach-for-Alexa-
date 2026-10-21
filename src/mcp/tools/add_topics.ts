import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Database from 'better-sqlite3';
import { ExamRow } from '../../db/db.js';

export const addTopicsSchema = {
  examId: z.number().describe("ID of the target exam to add topics to"),
  topics: z.array(z.string()).describe("List of topic names to append to this exam syllabus")
};

export function registerAddTopicsTool(server: McpServer, db: Database.Database) {
  server.tool(
    'add_topics',
    "Add syllabus topics to an existing exam for quiz generation and spaced repetition.",
    addTopicsSchema,
    async ({ examId, topics }) => {
      try {
        const examStmt = db.prepare<[number], ExamRow>(`SELECT * FROM exams WHERE id = ?`);
        const exam = examStmt.get(examId);

        if (!exam) {
          return {
            content: [{ type: 'text', text: `Exam with ID ${examId} was not found.` }],
            isError: true
          };
        }

        if (!topics || topics.length === 0) {
          return {
            content: [{ type: 'text', text: "Please provide at least one topic name." }],
            isError: true
          };
        }

        const insertTopic = db.prepare(`
          INSERT OR IGNORE INTO topics (exam_id, name) VALUES (?, ?)
        `);
        const insertSrs = db.prepare(`
          INSERT OR IGNORE INTO srs_items (exam_id, topic_id, ease_factor, interval_days, repetitions, mastery_score, due_date)
          VALUES (?, ?, 2.5, 0, 0, 0, date('now'))
        `);

        let addedCount = 0;
        const validNames: string[] = [];

        const transaction = db.transaction((topicNames: string[]) => {
          for (const raw of topicNames) {
            const name = raw.trim();
            if (name) {
              const res = insertTopic.run(examId, name);
              if (res.changes > 0) {
                const topicId = Number(res.lastInsertRowid);
                insertSrs.run(examId, topicId);
                addedCount++;
                validNames.push(name);
              }
            }
          }
        });

        transaction(topics);

        const voiceReply = addedCount > 0
          ? `Added ${addedCount} new topic${addedCount === 1 ? '' : 's'} to ${exam.subject}: ${validNames.slice(0, 3).join(', ')}${validNames.length > 3 ? ' and more' : ''}.`
          : `All provided topics were already present in ${exam.subject}.`;

        return {
          content: [{ type: 'text', text: voiceReply }],
          structuredContent: {
            examId,
            subject: exam.subject,
            topicsAdded: addedCount,
            topicNames: validNames
          }
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Failed to add topics: ${(err as Error).message}` }],
          isError: true
        };
      }
    }
  );
}
