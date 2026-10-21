import Database from 'better-sqlite3';
import { SrsItemRow, TopicRow } from '../db/db.js';

export interface SrsCalculationInput {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  masteryScore: number;
}

export interface SrsCalculationOutput {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  masteryScore: number;
  dueDate: string;
}

export interface WeakTopicInfo {
  topicId: number;
  name: string;
  masteryScore: number;
  intervalDays: number;
  repetitions: number;
  dueDate: string;
  isOverdue: boolean;
  priorityScore: number;
}

/**
 * Maps a percentage score (0-100) to an SM-2 grade (0-5).
 * 90-100: 5 (perfect response)
 * 75-89:  4 (correct response with hesitation)
 * 60-74:  3 (correct response recalled with serious difficulty)
 * 40-59:  2 (incorrect response; where the correct one seemed easy to recall)
 * 20-39:  1 (incorrect response; the correct one remembered)
 * 0-19:   0 (complete blackout)
 */
export function scoreToGrade(score: number): number {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  if (score >= 20) return 1;
  return 0;
}

/**
 * Implements the SuperMemo SM-2 algorithm.
 * Calculates next review interval, updated ease factor, and rolling mastery score.
 */
export function calculateSm2(
  current: SrsCalculationInput,
  score: number,
  reviewDate: Date = new Date()
): SrsCalculationOutput {
  const grade = scoreToGrade(score);
  let { easeFactor, intervalDays, repetitions, masteryScore } = current;

  // Ensure initial defaults if unset
  if (!easeFactor || easeFactor < 1.3) easeFactor = 2.5;
  if (intervalDays === undefined) intervalDays = 0;
  if (repetitions === undefined) repetitions = 0;
  if (masteryScore === undefined) masteryScore = 0;

  // Mastery score exponential moving average (60% weight to new test result, 40% to past mastery)
  // If first review, mastery is directly the score.
  let newMastery: number;
  if (repetitions === 0 && masteryScore === 0) {
    newMastery = Math.min(100, Math.max(0, Math.round(score)));
  } else {
    newMastery = Math.min(100, Math.max(0, Math.round(masteryScore * 0.4 + score * 0.6)));
  }

  // SM-2 Ease Factor calculation
  // EF' = EF + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
  const delta = 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02);
  let newEaseFactor = Number((easeFactor + delta).toFixed(2));
  if (newEaseFactor < 1.3) {
    newEaseFactor = 1.3;
  }

  let newIntervalDays: number;
  let newRepetitions: number;

  if (grade < 3) {
    // Review failed: reset repetitions and schedule for immediate review tomorrow
    newRepetitions = 0;
    newIntervalDays = 1;
  } else {
    // Review passed
    if (repetitions === 0) {
      newIntervalDays = 1;
    } else if (repetitions === 1) {
      newIntervalDays = 6;
    } else {
      newIntervalDays = Math.max(1, Math.round(intervalDays * newEaseFactor));
    }
    newRepetitions = repetitions + 1;
  }

  // Calculate new due date
  const nextDueDate = new Date(reviewDate.getTime() + newIntervalDays * 86400000);
  const dueDateStr = nextDueDate.toISOString().slice(0, 10);

  return {
    easeFactor: newEaseFactor,
    intervalDays: newIntervalDays,
    repetitions: newRepetitions,
    masteryScore: newMastery,
    dueDate: dueDateStr
  };
}

/**
 * Updates or creates the SRS record for a given exam topic after a quiz grade.
 */
export function updateTopicSrs(
  db: Database.Database,
  examId: number,
  topicId: number,
  score: number
): SrsItemRow {
  const existingStmt = db.prepare<[number, number], SrsItemRow>(`
    SELECT * FROM srs_items WHERE exam_id = ? AND topic_id = ?
  `);
  const existing = existingStmt.get(examId, topicId);

  const currentInput: SrsCalculationInput = existing
    ? {
        easeFactor: existing.ease_factor,
        intervalDays: existing.interval_days,
        repetitions: existing.repetitions,
        masteryScore: existing.mastery_score
      }
    : {
        easeFactor: 2.5,
        intervalDays: 0,
        repetitions: 0,
        masteryScore: 0
      };

  const now = new Date();
  const result = calculateSm2(currentInput, score, now);
  const nowIso = now.toISOString();

  if (existing) {
    const updateStmt = db.prepare(`
      UPDATE srs_items
      SET ease_factor = ?, interval_days = ?, repetitions = ?, mastery_score = ?, due_date = ?, last_reviewed = ?
      WHERE id = ?
    `);
    updateStmt.run(
      result.easeFactor,
      result.intervalDays,
      result.repetitions,
      result.masteryScore,
      result.dueDate,
      nowIso,
      existing.id
    );
  } else {
    const insertStmt = db.prepare(`
      INSERT INTO srs_items (exam_id, topic_id, ease_factor, interval_days, repetitions, mastery_score, due_date, last_reviewed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run(
      examId,
      topicId,
      result.easeFactor,
      result.intervalDays,
      result.repetitions,
      result.masteryScore,
      result.dueDate,
      nowIso
    );
  }

  const updated = existingStmt.get(examId, topicId);
  if (!updated) {
    throw new Error(`Failed to retrieve updated SRS item for exam ${examId}, topic ${topicId}`);
  }
  return updated;
}

/**
 * Returns topics for an exam ordered by weakness (lowest mastery first, most overdue first).
 */
export function getWeakTopics(
  db: Database.Database,
  examId: number,
  limit?: number
): WeakTopicInfo[] {
  const todayStr = new Date().toISOString().slice(0, 10);

  // Retrieve all topics for this exam and their SRS items (left join)
  const stmt = db.prepare<[number], {
    topic_id: number;
    name: string;
    ease_factor: number | null;
    interval_days: number | null;
    repetitions: number | null;
    mastery_score: number | null;
    due_date: string | null;
  }>(`
    SELECT
      t.id as topic_id,
      t.name,
      s.ease_factor,
      s.interval_days,
      s.repetitions,
      s.mastery_score,
      s.due_date
    FROM topics t
    LEFT JOIN srs_items s ON t.id = s.topic_id AND t.exam_id = s.exam_id
    WHERE t.exam_id = ?
  `);

  const rows = stmt.all(examId);

  const evaluated: WeakTopicInfo[] = rows.map((r) => {
    const mastery = r.mastery_score ?? 0;
    const interval = r.interval_days ?? 0;
    const reps = r.repetitions ?? 0;
    const dueDate = r.due_date ?? todayStr;
    const isOverdue = dueDate <= todayStr;

    // Priority score: higher means topic needs review urgently
    // Topics with 0 mastery get 100 base points.
    // Overdue items get extra 30 points.
    const priority = (100 - mastery) + (isOverdue ? 30 : 0);

    return {
      topicId: r.topic_id,
      name: r.name,
      masteryScore: mastery,
      intervalDays: interval,
      repetitions: reps,
      dueDate,
      isOverdue,
      priorityScore: priority
    };
  });

  // Sort descending by priority (lowest mastery / most overdue first)
  evaluated.sort((a, b) => b.priorityScore - a.priorityScore);

  return limit ? evaluated.slice(0, limit) : evaluated;
}

/**
 * Selects the single best topic to review next for an exam.
 */
export function getNextReviewTopic(
  db: Database.Database,
  examId: number
): { topicId: number; name: string; masteryScore: number } | null {
  const weak = getWeakTopics(db, examId, 1);
  if (weak.length === 0) return null;
  return {
    topicId: weak[0].topicId,
    name: weak[0].name,
    masteryScore: weak[0].masteryScore
  };
}
