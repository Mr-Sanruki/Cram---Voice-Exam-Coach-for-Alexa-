import { getDb, closeDb } from './db.js';
import { generateStudyPlan } from '../services/planner.js';

export function seedDatabase(customPath?: string) {
  const db = getDb(customPath);

  console.log('🌱 Seeding Cram database with demo exam data...');

  // Clear existing data cleanly
  db.exec(`
    DELETE FROM quiz_questions;
    DELETE FROM quiz_sessions;
    DELETE FROM study_plans;
    DELETE FROM study_logs;
    DELETE FROM srs_items;
    DELETE FROM topics;
    DELETE FROM exams;
  `);

  const now = new Date();
  const dsgtDate = new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10);
  const aoaDate = new Date(now.getTime() + 21 * 86400000).toISOString().slice(0, 10);
  const coaDate = new Date(now.getTime() + 28 * 86400000).toISOString().slice(0, 10);

  const insertExam = db.prepare(`INSERT INTO exams (subject, exam_date) VALUES (?, ?)`);
  const insertTopic = db.prepare(`INSERT INTO topics (exam_id, name) VALUES (?, ?)`);
  const insertSrs = db.prepare(`
    INSERT INTO srs_items (exam_id, topic_id, ease_factor, interval_days, repetitions, mastery_score, due_date, last_reviewed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // 1. DSGT Exam
  const dsgtRes = insertExam.run('DSGT', dsgtDate);
  const dsgtId = Number(dsgtRes.lastInsertRowid);
  const dsgtTopics = [
    { name: 'Graph Theory', mastery: 35, ease: 2.1, interval: 1, reps: 1 },
    { name: 'Trees', mastery: 80, ease: 2.6, interval: 6, reps: 2 },
    { name: 'Propositional Logic', mastery: 50, ease: 2.4, interval: 3, reps: 2 },
    { name: 'Recurrence Relations', mastery: 40, ease: 2.2, interval: 1, reps: 1 },
    { name: 'Combinatorics', mastery: 65, ease: 2.5, interval: 4, reps: 2 }
  ];

  for (const t of dsgtTopics) {
    const tr = insertTopic.run(dsgtId, t.name);
    const topicId = Number(tr.lastInsertRowid);
    const dueDate = new Date(now.getTime() + t.interval * 86400000).toISOString().slice(0, 10);
    const lastRev = new Date(now.getTime() - 86400000).toISOString();
    insertSrs.run(dsgtId, topicId, t.ease, t.interval, t.reps, t.mastery, dueDate, lastRev);
  }

  // 2. AOA Exam
  const aoaRes = insertExam.run('AOA', aoaDate);
  const aoaId = Number(aoaRes.lastInsertRowid);
  const aoaTopics = [
    { name: 'Divide and Conquer', mastery: 85, ease: 2.7, interval: 8, reps: 3 },
    { name: 'Dynamic Programming', mastery: 38, ease: 2.0, interval: 1, reps: 1 },
    { name: 'Greedy Algorithms', mastery: 72, ease: 2.5, interval: 5, reps: 2 },
    { name: 'Graph Algorithms', mastery: 45, ease: 2.3, interval: 2, reps: 1 },
    { name: 'NP-Completeness', mastery: 25, ease: 1.8, interval: 1, reps: 1 }
  ];

  for (const t of aoaTopics) {
    const tr = insertTopic.run(aoaId, t.name);
    const topicId = Number(tr.lastInsertRowid);
    const dueDate = new Date(now.getTime() + t.interval * 86400000).toISOString().slice(0, 10);
    const lastRev = new Date(now.getTime() - 2 * 86400000).toISOString();
    insertSrs.run(aoaId, topicId, t.ease, t.interval, t.reps, t.mastery, dueDate, lastRev);
  }

  // 3. COA Exam
  const coaRes = insertExam.run('COA', coaDate);
  const coaId = Number(coaRes.lastInsertRowid);
  const coaTopics = [
    { name: 'Pipelining & Hazards', mastery: 30, ease: 1.9, interval: 1, reps: 1 },
    { name: 'Cache Memory Mapping', mastery: 42, ease: 2.2, interval: 2, reps: 1 },
    { name: 'Instruction Set Architecture', mastery: 78, ease: 2.6, interval: 6, reps: 2 },
    { name: 'Virtual Memory', mastery: 55, ease: 2.4, interval: 3, reps: 2 },
    { name: 'CPU Control Unit', mastery: 60, ease: 2.5, interval: 4, reps: 2 }
  ];

  for (const t of coaTopics) {
    const tr = insertTopic.run(coaId, t.name);
    const topicId = Number(tr.lastInsertRowid);
    const dueDate = new Date(now.getTime() + t.interval * 86400000).toISOString().slice(0, 10);
    const lastRev = new Date(now.getTime() - 3 * 86400000).toISOString();
    insertSrs.run(coaId, topicId, t.ease, t.interval, t.reps, t.mastery, dueDate, lastRev);
  }

  // 4. Seed past study logs to build a 5-day study streak and 160 minutes studied
  const insertLog = db.prepare(`
    INSERT INTO study_logs (exam_id, topic_id, minutes, logged_at)
    VALUES (?, 1, ?, datetime('now', ?))
  `);

  insertLog.run(dsgtId, 30, '-0 days');
  insertLog.run(dsgtId, 35, '-1 days');
  insertLog.run(aoaId, 25, '-2 days');
  insertLog.run(dsgtId, 40, '-3 days');
  insertLog.run(coaId, 30, '-4 days');

  // 5. Generate daily study plans for DSGT, AOA, COA
  generateStudyPlan(db, dsgtId, 2);
  generateStudyPlan(db, aoaId, 2);
  generateStudyPlan(db, coaId, 1.5);

  console.log('✅ Cram database seeded successfully!');
  console.log(`- Exams: DSGT (${dsgtDate}), AOA (${aoaDate}), COA (${coaDate})`);
  console.log('- 15 Syllabus topics with initial SM-2 spaced repetition state');
  console.log('- 5-day active study streak with 160 minutes logged');
  console.log("- Full day-by-day study schedule generated for today's review");
}

if (process.env.NODE_ENV !== 'test') {
  seedDatabase();
  closeDb();
}
