-- Cram Database Schema
-- SQLite3 with Foreign Keys enabled

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  exam_date TEXT NOT NULL, -- ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(exam_id, name)
);

CREATE TABLE IF NOT EXISTS srs_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  mastery_score INTEGER NOT NULL DEFAULT 0, -- 0 to 100
  due_date TEXT NOT NULL, -- YYYY-MM-DD
  last_reviewed TEXT,     -- ISO timestamp
  UNIQUE(exam_id, topic_id)
);

CREATE TABLE IF NOT EXISTS study_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  plan_date TEXT NOT NULL, -- YYYY-MM-DD
  tasks_json TEXT NOT NULL, -- JSON array of { topic: string, minutes: number, goal: string, completed: boolean }
  hours_allocated REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(exam_id, plan_date)
);

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id TEXT PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 10,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'completed' | 'abandoned'
  total_questions INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  average_score REAL NOT NULL DEFAULT 0,
  current_question_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  expected_answer TEXT NOT NULL,
  user_answer TEXT,
  score INTEGER, -- 0 to 100
  feedback TEXT,
  answered_at TEXT
);

CREATE TABLE IF NOT EXISTS study_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  minutes INTEGER NOT NULL,
  logged_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_topics_exam ON topics(exam_id);
CREATE INDEX IF NOT EXISTS idx_srs_exam ON srs_items(exam_id);
CREATE INDEX IF NOT EXISTS idx_srs_due ON srs_items(due_date);
CREATE INDEX IF NOT EXISTS idx_study_plans_date ON study_plans(plan_date);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_session ON quiz_questions(session_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_date ON study_logs(logged_at);
