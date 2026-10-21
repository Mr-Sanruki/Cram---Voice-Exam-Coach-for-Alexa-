import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Database from 'better-sqlite3';
import { calculateStreak, ExamRow } from '../../db/db.js';

export const getProgressSchema = {
  examId: z.number().optional().describe("Optional exam ID to view progress for a specific exam")
};

export function registerGetProgressTool(server: McpServer, db: Database.Database) {
  server.tool(
    'get_progress',
    "Get overall study progress, current study streak, total minutes studied, and mastery per topic.",
    getProgressSchema,
    async ({ examId }) => {
      try {
        const streak = calculateStreak(db);

        const totalMinutes = examId
          ? (db.prepare<[number], { total: number | null }>(`
              SELECT coalesce(sum(minutes), 0) as total FROM study_logs WHERE exam_id = ?
            `).get(examId)?.total || 0)
          : (db.prepare<[], { total: number | null }>(`
              SELECT coalesce(sum(minutes), 0) as total FROM study_logs
            `).get()?.total || 0);

        // Topic mastery list
        let topics;
        if (examId) {
          const topicStmt = db.prepare<[number], {
            exam_id: number;
            subject: string;
            topic_name: string;
            mastery_score: number;
            repetitions: number;
            interval_days: number;
          }>(`
            SELECT
              e.id as exam_id,
              e.subject,
              t.name as topic_name,
              coalesce(s.mastery_score, 0) as mastery_score,
              coalesce(s.repetitions, 0) as repetitions,
              coalesce(s.interval_days, 0) as interval_days
            FROM topics t
            JOIN exams e ON t.exam_id = e.id
            LEFT JOIN srs_items s ON t.id = s.topic_id
            WHERE e.id = ?
            ORDER BY mastery_score ASC
          `);
          topics = topicStmt.all(examId);
        } else {
          const topicStmt = db.prepare<[], {
            exam_id: number;
            subject: string;
            topic_name: string;
            mastery_score: number;
            repetitions: number;
            interval_days: number;
          }>(`
            SELECT
              e.id as exam_id,
              e.subject,
              t.name as topic_name,
              coalesce(s.mastery_score, 0) as mastery_score,
              coalesce(s.repetitions, 0) as repetitions,
              coalesce(s.interval_days, 0) as interval_days
            FROM topics t
            JOIN exams e ON t.exam_id = e.id
            LEFT JOIN srs_items s ON t.id = s.topic_id
            ORDER BY e.subject ASC, mastery_score ASC
          `);
          topics = topicStmt.all();
        }

        const avgMastery = topics.length > 0
          ? Math.round(topics.reduce((acc, t) => acc + t.mastery_score, 0) / topics.length)
          : 0;

        const voiceReply = `You're on a ${streak}-day study streak with ${totalMinutes} total minutes studied. Your average mastery across ${topics.length} topics is ${avgMastery}%.`;

        return {
          content: [{ type: 'text', text: voiceReply }],
          structuredContent: {
            streakDays: streak,
            totalMinutesStudied: totalMinutes,
            averageMastery: avgMastery,
            totalTopics: topics.length,
            topics: topics.map((t) => ({
              subject: t.subject,
              topic: t.topic_name,
              mastery: t.mastery_score,
              repetitions: t.repetitions,
              intervalDays: t.interval_days
            }))
          }
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Failed to retrieve progress: ${(err as Error).message}` }],
          isError: true
        };
      }
    }
  );
}
