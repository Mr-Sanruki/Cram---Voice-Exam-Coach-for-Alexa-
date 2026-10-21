import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

let dbInstance: Database.Database | null = null;

export interface ExamRow {
  id: number;
  subject: string;
  exam_date: string;
  created_at: string;
}

export interface TopicRow {
  id: number;
  exam_id: number;
  name: string;
  created_at: string;
}

export interface SrsItemRow {
  id: number;
  exam_id: number;
  topic_id: number;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  mastery_score: number;
  due_date: string;
  last_reviewed: string | null;
}

export interface StudyPlanRow {
  id: number;
  exam_id: number;
  plan_date: string;
  tasks_json: string;
  hours_allocated: number;
  created_at: string;
}

export interface QuizSessionRow {
  id: string;
  exam_id: number;
  topic_id: number | null;
  duration_minutes: number;
  started_at: string;
  ended_at: string | null;
  status: 'active' | 'completed' | 'abandoned';
  total_questions: number;
  correct_count: number;
  average_score: number;
  current_question_index: number;
}

export interface QuizQuestionRow {
  id: number;
  session_id: string;
  topic_id: number;
  question_text: string;
  expected_answer: string;
  user_answer: string | null;
  score: number | null;
  feedback: string | null;
  answered_at: string | null;
}

export interface StudyLogRow {
  id: number;
  exam_id: number;
  topic_id: number;
  minutes: number;
  logged_at: string;
}

/**
 * Initializes and returns the SQLite database instance.
 * Automatically runs schema.sql to ensure all tables and indexes exist.
 */
export function getDb(customPath?: string): Database.Database {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const dbPath = customPath || process.env.DB_PATH || './data/cram.db';

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  // Load and execute schema
  const schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
  } else {
    // Fallback if running from dist or test
    const distSchemaPath = path.resolve(import.meta.dirname, 'schema.sql');
    if (fs.existsSync(distSchemaPath)) {
      const schemaSql = fs.readFileSync(distSchemaPath, 'utf8');
      db.exec(schemaSql);
    }
  }

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

/**
 * Closes the active database connection.
 */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Helper to calculate current consecutive study streak in days.
 */
export function calculateStreak(db: Database.Database): number {
  const datesStmt = db.prepare(`
    SELECT DISTINCT substr(logged_at, 1, 10) as study_date
    FROM study_logs
    UNION
    SELECT DISTINCT substr(started_at, 1, 10) as study_date
    FROM quiz_sessions
    WHERE status = 'completed'
    ORDER BY study_date DESC
  `);

  const rows = datesStmt.all() as Array<{ study_date: string }>;
  if (rows.length === 0) return 0;

  const today = new Date().toISOString().slice(0, 10);
  const yesterdayDate = new Date(Date.now() - 86400000);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);

  // If student studied neither today nor yesterday, streak is 0
  const latest = rows[0].study_date;
  if (latest !== today && latest !== yesterday) {
    return 0;
  }

  let streak = 0;
  let expected = new Date(latest);

  for (const row of rows) {
    const rowDate = new Date(row.study_date);
    const diffDays = Math.round((expected.getTime() - rowDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      streak++;
      expected = new Date(rowDate.getTime() - 86400000);
    } else {
      break;
    }
  }

  return streak;
}
