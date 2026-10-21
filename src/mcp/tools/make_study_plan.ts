import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Database from 'better-sqlite3';
import { generateStudyPlan } from '../../services/planner.js';

export const makeStudyPlanSchema = {
  examId: z.number().describe("ID of the exam to create a study plan for"),
  hoursPerDay: z.number().optional().describe("Number of study hours dedicated per day (default 2)")
};

export function registerMakeStudyPlanTool(server: McpServer, db: Database.Database) {
  server.tool(
    'make_study_plan',
    "Generate a day-by-day study plan leading up to the exam, weighting weaker topics more heavily.",
    makeStudyPlanSchema,
    async ({ examId, hoursPerDay = 2 }) => {
      try {
        const plan = generateStudyPlan(db, examId, hoursPerDay);

        const voiceReply = `Created a ${plan.days.length}-day study plan for ${plan.subject} with ${hoursPerDay} hours per day. Weakest topics are prioritized first.`;

        return {
          content: [{ type: 'text', text: voiceReply }],
          structuredContent: {
            examId: plan.examId,
            subject: plan.subject,
            examDate: plan.examDate,
            daysRemaining: plan.daysRemaining,
            hoursPerDay: plan.hoursPerDay,
            totalHours: plan.totalHours,
            daysPlanned: plan.days.length,
            todayTasks: plan.days[0]?.tasks || []
          }
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Failed to make study plan: ${(err as Error).message}` }],
          isError: true
        };
      }
    }
  );
}
