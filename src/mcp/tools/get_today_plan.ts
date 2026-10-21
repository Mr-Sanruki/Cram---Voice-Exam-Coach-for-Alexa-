import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Database from 'better-sqlite3';
import { getTodayPlan } from '../../services/planner.js';

export function registerGetTodayPlanTool(server: McpServer, db: Database.Database) {
  server.tool(
    'get_today_plan',
    "Get all study tasks and topics scheduled for today across all registered exams.",
    {},
    async () => {
      try {
        const todayPlans = getTodayPlan(db);

        if (todayPlans.length === 0) {
          return {
            content: [{ type: 'text', text: "You have no scheduled tasks for today. Say 'make me a study plan' to generate your daily review schedule." }],
            structuredContent: { plans: [] }
          };
        }

        const taskSummaries: string[] = [];
        let totalMinutes = 0;

        for (const plan of todayPlans) {
          for (const task of plan.tasks) {
            totalMinutes += task.minutes;
            taskSummaries.push(`${task.minutes} minutes on ${task.topic} (${plan.subject})`);
          }
        }

        const voiceReply = `Today you have ${taskSummaries.length} study tasks totaling ${totalMinutes} minutes: ${taskSummaries.join(', ')}.`;

        return {
          content: [{ type: 'text', text: voiceReply }],
          structuredContent: {
            totalTasks: taskSummaries.length,
            totalMinutes,
            plans: todayPlans
          }
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Failed to get today's plan: ${(err as Error).message}` }],
          isError: true
        };
      }
    }
  );
}
