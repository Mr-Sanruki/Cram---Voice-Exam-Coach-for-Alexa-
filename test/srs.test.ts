import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { calculateSm2, scoreToGrade, updateTopicSrs, getWeakTopics } from '../src/services/srs.js';
import { getDb } from '../src/db/db.js';

describe('Spaced Repetition Service (SM-2)', () => {
  it('converts scores to grades correctly', () => {
    expect(scoreToGrade(95)).toBe(5);
    expect(scoreToGrade(80)).toBe(4);
    expect(scoreToGrade(65)).toBe(3);
    expect(scoreToGrade(45)).toBe(2);
    expect(scoreToGrade(25)).toBe(1);
    expect(scoreToGrade(10)).toBe(0);
  });

  it('calculates initial review correctly for perfect score', () => {
    const initial = { easeFactor: 2.5, intervalDays: 0, repetitions: 0, masteryScore: 0 };
    const fixedDate = new Date('2026-11-01T12:00:00Z');
    const result = calculateSm2(initial, 95, fixedDate);

    expect(result.repetitions).toBe(1);
    expect(result.intervalDays).toBe(1);
    expect(result.masteryScore).toBe(95);
    expect(result.easeFactor).toBeGreaterThanOrEqual(2.5);
    expect(result.dueDate).toBe('2026-11-02');
  });

  it('resets repetitions on failed review (grade < 3)', () => {
    const current = { easeFactor: 2.5, intervalDays: 6, repetitions: 2, masteryScore: 75 };
    const fixedDate = new Date('2026-11-01T12:00:00Z');
    // Score 30 -> grade 1 (failed review)
    const result = calculateSm2(current, 30, fixedDate);

    expect(result.repetitions).toBe(0);
    expect(result.intervalDays).toBe(1);
    expect(result.easeFactor).toBeLessThan(2.5);
    expect(result.dueDate).toBe('2026-11-02');
    // Mastery should drop: 75 * 0.4 + 30 * 0.6 = 30 + 18 = 48
    expect(result.masteryScore).toBe(48);
  });

  it('scales interval for consecutive successful repetitions', () => {
    const rep1 = { easeFactor: 2.5, intervalDays: 1, repetitions: 1, masteryScore: 80 };
    const fixedDate = new Date('2026-11-01T12:00:00Z');
    const result = calculateSm2(rep1, 90, fixedDate);

    expect(result.repetitions).toBe(2);
    expect(result.intervalDays).toBe(6);

    // 3rd repetition scales interval by ease factor
    const rep2 = { easeFactor: result.easeFactor, intervalDays: result.intervalDays, repetitions: 2, masteryScore: result.masteryScore };
    const result3 = calculateSm2(rep2, 90, fixedDate);
    expect(result3.repetitions).toBe(3);
    expect(result3.intervalDays).toBeGreaterThan(6);
  });

  it('enforces minimum ease factor of 1.3', () => {
    let state = { easeFactor: 1.4, intervalDays: 1, repetitions: 0, masteryScore: 10 };
    const fixedDate = new Date('2026-11-01T12:00:00Z');
    // Repeated complete blackouts
    for (let i = 0; i < 5; i++) {
      state = calculateSm2(state, 0, fixedDate);
    }
    expect(state.easeFactor).toBe(1.3);
  });
});

describe('Database SRS Topic Integration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getDb(':memory:');
    db.prepare(`INSERT INTO exams (id, subject, exam_date) VALUES (1, 'DSGT', '2026-12-01')`).run();
    db.prepare(`INSERT INTO topics (id, exam_id, name) VALUES (10, 1, 'Graph Theory')`).run();
    db.prepare(`INSERT INTO topics (id, exam_id, name) VALUES (11, 1, 'Trees')`).run();
  });

  afterEach(() => {
    db.close();
  });

  it('updates topic SRS item and retrieves prioritized weak topics', () => {
    // Topic 10 has low score
    updateTopicSrs(db, 1, 10, 25);
    // Topic 11 has high score
    updateTopicSrs(db, 1, 11, 95);

    const weak = getWeakTopics(db, 1);
    expect(weak.length).toBe(2);
    // Graph Theory should be prioritized first due to lower mastery
    expect(weak[0].name).toBe('Graph Theory');
    expect(weak[0].masteryScore).toBe(25);
    expect(weak[1].name).toBe('Trees');
    expect(weak[1].masteryScore).toBe(95);
  });
});
