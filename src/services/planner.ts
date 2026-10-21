import Database from 'better-sqlite3';
import { ExamRow, TopicRow, StudyPlanRow } from '../db/db.js';
import { getWeakTopics, WeakTopicInfo } from './srs.js';

export interface PlanTaskItem {
  topic: string;
  minutes: number;
  goal: string;
  completed: boolean;
}

export interface DayPlanResult {
  date: string;
  dayOffset: number;
  totalMinutes: number;
  tasks: PlanTaskItem[];
}

export interface GeneratedStudyPlanResult {
  examId: number;
  subject: string;
  examDate: string;
  daysRemaining: number;
  hoursPerDay: number;
  totalHours: number;
  days: DayPlanResult[];
}

/**
 * Generates and saves a day-by-day study plan leading up to an exam,
 * weighting topics by mastery weakness and remaining days.
 */
export function generateStudyPlan(
  db: Database.Database,
  examId: number,
  hoursPerDay: number = 2
): GeneratedStudyPlanResult {
  const examStmt = db.prepare<[number], ExamRow>(`
    SELECT * FROM exams WHERE id = ?
  `);
  const exam = examStmt.get(examId);

  if (!exam) {
    throw new Error(`Exam with ID ${examId} not found`);
  }

  const today = new Date();
  const examDate = new Date(exam.exam_date);
  const diffTime = examDate.getTime() - today.getTime();
  let daysRemaining = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  // Retrieve topics and their weakness priority
  const weakTopics = getWeakTopics(db, examId);
  if (weakTopics.length === 0) {
    throw new Error(`No topics registered for exam ${exam.subject}. Add topics first.`);
  }

  // Calculate topic weights based on weakness
  // Lower mastery gets more time and attention
  const totalPriority = weakTopics.reduce((acc, t) => acc + t.priorityScore, 0);
  const totalMinutesPerDay = Math.round(hoursPerDay * 60);

  // Clear existing future plans for this exam to regenerate freshly
  const todayStr = today.toISOString().slice(0, 10);
  const deleteStmt = db.prepare(`
    DELETE FROM study_plans WHERE exam_id = ? AND plan_date >= ?
  `);
  deleteStmt.run(examId, todayStr);

  const planDays: DayPlanResult[] = [];
  const insertStmt = db.prepare(`
    INSERT INTO study_plans (exam_id, plan_date, tasks_json, hours_allocated)
    VALUES (?, ?, ?, ?)
  `);

  // Cap generation at 30 days maximum to keep DB tidy
  const planHorizonDays = Math.min(daysRemaining, 30);

  // Rotating focus across days with weakness weighting
  for (let d = 0; d < planHorizonDays; d++) {
    const dayDate = new Date(today.getTime() + d * 86400000);
    const dayDateStr = dayDate.toISOString().slice(0, 10);

    // Pick 2-3 focus topics for this day, cycling with weighted preference
    const dayTopics: WeakTopicInfo[] = [];
    const startIndex = (d * 2) % weakTopics.length;
    dayTopics.push(weakTopics[startIndex]);
    if (weakTopics.length > 1) {
      dayTopics.push(weakTopics[(startIndex + 1) % weakTopics.length]);
    }

    const minutesPerTask = Math.round(totalMinutesPerDay / dayTopics.length);
    const tasks: PlanTaskItem[] = dayTopics.map((t, idx) => {
      let goal = '';
      if (t.masteryScore < 30) {
        goal = `Fundamental concepts review and definitions for ${t.name}`;
      } else if (t.masteryScore < 70) {
        goal = `Solve intermediate practice problems and test recall on ${t.name}`;
      } else {
        goal = `Speed recall drill and high-yield formula quiz on ${t.name}`;
      }

      return {
        topic: t.name,
        minutes: minutesPerTask,
        goal,
        completed: false
      };
    });

    const dayResult: DayPlanResult = {
      date: dayDateStr,
      dayOffset: d,
      totalMinutes: totalMinutesPerDay,
      tasks
    };

    planDays.push(dayResult);

    insertStmt.run(
      examId,
      dayDateStr,
      JSON.stringify(tasks),
      hoursPerDay
    );
  }

  return {
    examId,
    subject: exam.subject,
    examDate: exam.exam_date,
    daysRemaining,
    hoursPerDay,
    totalHours: Number((planHorizonDays * hoursPerDay).toFixed(1)),
    days: planDays
  };
}

/**
 * Retrieves today's study tasks across all exams.
 */
export function getTodayPlan(db: Database.Database): Array<{
  examId: number;
  subject: string;
  hoursAllocated: number;
  tasks: PlanTaskItem[];
}> {
  const todayStr = new Date().toISOString().slice(0, 10);

  const stmt = db.prepare<[string], {
    exam_id: number;
    subject: string;
    hours_allocated: number;
    tasks_json: string;
  }>(`
    SELECT
      sp.exam_id,
      e.subject,
      sp.hours_allocated,
      sp.tasks_json
    FROM study_plans sp
    JOIN exams e ON sp.exam_id = e.id
    WHERE sp.plan_date = ?
  `);

  const rows = stmt.all(todayStr);

  return rows.map((r) => {
    let tasks: PlanTaskItem[] = [];
    try {
      tasks = JSON.parse(r.tasks_json);
    } catch {
      tasks = [];
    }

    return {
      examId: r.exam_id,
      subject: r.subject,
      hoursAllocated: r.hours_allocated,
      tasks
    };
  });
}
