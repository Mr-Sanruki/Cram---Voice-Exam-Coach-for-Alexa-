import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { generateStudyPlan, getTodayPlan } from '../src/services/planner.js';
import { getDb } from '../src/db/db.js';

describe('Study Planner Service', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getDb(':memory:');
    const futureDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    db.prepare(`INSERT INTO exams (id, subject, exam_date) VALUES (1, 'AOA', ?)`).run(futureDate);
    db.prepare(`INSERT INTO topics (id, exam_id, name) VALUES (1, 1, 'Dynamic Programming')`).run();
    db.prepare(`INSERT INTO topics (id, exam_id, name) VALUES (2, 1, 'Divide and Conquer')`).run();
    db.prepare(`INSERT INTO topics (id, exam_id, name) VALUES (3, 1, 'Greedy Algorithms')`).run();
  });

  afterEach(() => {
    db.close();
  });

  it('generates a day-by-day plan with appropriate task durations', () => {
    const plan = generateStudyPlan(db, 1, 2);

    expect(plan.subject).toBe('AOA');
    expect(plan.hoursPerDay).toBe(2);
    expect(plan.days.length).toBeGreaterThan(0);

    const firstDay = plan.days[0];
    expect(firstDay.tasks.length).toBeGreaterThanOrEqual(1);
    expect(firstDay.totalMinutes).toBe(120);

    // Verify tasks have non-empty goal and topic
    for (const t of firstDay.tasks) {
      expect(t.topic).toBeDefined();
      expect(t.minutes).toBeGreaterThan(0);
      expect(t.goal.length).toBeGreaterThan(5);
    }
  });

  it('retrieves tasks scheduled for today via getTodayPlan', () => {
    generateStudyPlan(db, 1, 1.5);
    const todayPlans = getTodayPlan(db);

    expect(todayPlans.length).toBe(1);
    expect(todayPlans[0].subject).toBe('AOA');
    expect(todayPlans[0].tasks.length).toBeGreaterThan(0);
  });
});
