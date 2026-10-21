import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Database from 'better-sqlite3';
import { ExamRow } from '../../db/db.js';

export function registerListExamsTool(server: McpServer, db: Database.Database) {
  server.tool(
    'list_exams',
    "List all upcoming exams registered in Cram with remaining days countdown.",
    {},
    async () => {
      try {
        const stmt = db.prepare<[], ExamRow & { topic_count: number }>(`
          SELECT
            e.id,
            e.subject,
            e.exam_date,
            e.created_at,
            (SELECT count(*) FROM topics t WHERE t.exam_id = e.id) as topic_count
          FROM exams e
          ORDER BY e.exam_date ASC
        `);
        const exams = stmt.all();

        if (exams.length === 0) {
          return {
            content: [{ type: 'text', text: "You have no upcoming exams registered. Say 'Alexa, add my DSGT exam on November 15' to get started." }],
            structuredContent: { exams: [] }
          };
        }

        const now = new Date();
        const details = exams.map((e) => {
          const examDate = new Date(e.exam_date);
          const daysLeft = Math.ceil((examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return {
            id: e.id,
            subject: e.subject,
            examDate: e.exam_date,
            daysLeft,
            topicCount: e.topic_count
          };
        });

        // Formulate voice-friendly text
        const parts = details.map((d) => {
          if (d.daysLeft <= 0) return `${d.subject} is today`;
          if (d.daysLeft === 1) return `${d.subject} tomorrow`;
          return `${d.subject} in ${d.daysLeft} days`;
        });

        let voiceText = '';
        if (parts.length === 1) {
          voiceText = `You have one upcoming exam: ${parts[0]}.`;
        } else if (parts.length === 2) {
          voiceText = `You have 2 upcoming exams: ${parts[0]}, and ${parts[1]}.`;
        } else {
          voiceText = `You have ${parts.length} upcoming exams: ${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}.`;
        }

        return {
          content: [{ type: 'text', text: voiceText }],
          structuredContent: {
            totalExams: exams.length,
            exams: details
          }
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Failed to list exams: ${(err as Error).message}` }],
          isError: true
        };
      }
    }
  );
}
