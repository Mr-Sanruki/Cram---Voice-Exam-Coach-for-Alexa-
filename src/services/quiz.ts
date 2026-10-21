import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { ExamRow, TopicRow, QuizSessionRow, QuizQuestionRow } from '../db/db.js';
import { updateTopicSrs, getWeakTopics, getNextReviewTopic } from './srs.js';
import { llm } from './llm.js';

export interface StartQuizResult {
  sessionId: string;
  examId: number;
  subject: string;
  topicId: number;
  topicName: string;
  durationMinutes: number;
  questionNumber: number;
  questionText: string;
  spokenPrompt: string;
}

export interface AnswerQuestionResult {
  sessionId: string;
  isComplete: boolean;
  score: number;
  feedback: string;
  correctAnswer: string;
  spokenReply: string;
  nextQuestion?: {
    questionNumber: number;
    questionText: string;
    topicName: string;
  };
  summary?: {
    totalQuestions: number;
    averageScore: number;
    correctCount: number;
  };
}

export interface EndQuizResult {
  sessionId: string;
  totalQuestions: number;
  answeredQuestions: number;
  averageScore: number;
  spokenSummary: string;
}

/**
 * Starts a spoken quiz session for an exam and returns the first question.
 */
export async function startQuiz(
  db: Database.Database,
  examId: number,
  topicName?: string,
  durationMinutes: number = 10
): Promise<StartQuizResult> {
  const examStmt = db.prepare<[number], ExamRow>(`SELECT * FROM exams WHERE id = ?`);
  const exam = examStmt.get(examId);
  if (!exam) {
    throw new Error(`Exam with ID ${examId} not found.`);
  }

  let selectedTopic: TopicRow | undefined;

  if (topicName && topicName.trim()) {
    const topicStmt = db.prepare<[number, string], TopicRow>(`
      SELECT * FROM topics WHERE exam_id = ? AND lower(name) = lower(?)
    `);
    selectedTopic = topicStmt.get(examId, topicName.trim());

    if (!selectedTopic) {
      // Fuzzy search topic name
      const fuzzyStmt = db.prepare<[number, string], TopicRow>(`
        SELECT * FROM topics WHERE exam_id = ? AND lower(name) LIKE lower(?) LIMIT 1
      `);
      selectedTopic = fuzzyStmt.get(examId, `%${topicName.trim()}%`);
    }
  }

  if (!selectedTopic) {
    // Pick the most urgent weak topic via SRS
    const nextTopic = getNextReviewTopic(db, examId);
    if (nextTopic) {
      const topicStmt = db.prepare<[number], TopicRow>(`SELECT * FROM topics WHERE id = ?`);
      selectedTopic = topicStmt.get(nextTopic.topicId);
    }
  }

  if (!selectedTopic) {
    // Default to first topic of the exam
    const firstTopicStmt = db.prepare<[number], TopicRow>(`
      SELECT * FROM topics WHERE exam_id = ? ORDER BY id ASC LIMIT 1
    `);
    selectedTopic = firstTopicStmt.get(examId);
  }

  if (!selectedTopic) {
    throw new Error(`No topics found for ${exam.subject}. Please add topics first.`);
  }

  const sessionId = `quiz_${Date.now()}_${randomUUID().slice(0, 8)}`;

  // Create session
  const createSessionStmt = db.prepare(`
    INSERT INTO quiz_sessions (id, exam_id, topic_id, duration_minutes, status, total_questions, current_question_index)
    VALUES (?, ?, ?, ?, 'active', 1, 1)
  `);
  createSessionStmt.run(sessionId, examId, selectedTopic.id, durationMinutes);

  // Generate first question via LLM
  const generated = await llm.generateQuestion(exam.subject, selectedTopic.name);

  // Store in quiz_questions
  const createQuestionStmt = db.prepare(`
    INSERT INTO quiz_questions (session_id, topic_id, question_text, expected_answer)
    VALUES (?, ?, ?, ?)
  `);
  createQuestionStmt.run(sessionId, selectedTopic.id, generated.question, generated.expectedAnswer);

  const spokenPrompt = `Starting a ${durationMinutes}-minute quiz on ${selectedTopic.name} for ${exam.subject}. First question: ${generated.question}`;

  return {
    sessionId,
    examId,
    subject: exam.subject,
    topicId: selectedTopic.id,
    topicName: selectedTopic.name,
    durationMinutes,
    questionNumber: 1,
    questionText: generated.question,
    spokenPrompt
  };
}

/**
 * Grades a student's answer, updates SRS spaced repetition records, and provides the next question or final summary.
 */
export async function answerQuestion(
  db: Database.Database,
  sessionId: string,
  userAnswer: string
): Promise<AnswerQuestionResult> {
  const sessionStmt = db.prepare<[string], QuizSessionRow>(`
    SELECT * FROM quiz_sessions WHERE id = ?
  `);
  const session = sessionStmt.get(sessionId);

  if (!session) {
    throw new Error(`Quiz session ${sessionId} not found.`);
  }

  if (session.status !== 'active') {
    throw new Error(`Quiz session ${sessionId} is already ${session.status}.`);
  }

  // Find the latest unanswered question in this session
  const questionStmt = db.prepare<[string], QuizQuestionRow>(`
    SELECT * FROM quiz_questions
    WHERE session_id = ? AND answered_at IS NULL
    ORDER BY id ASC LIMIT 1
  `);
  const question = questionStmt.get(sessionId);

  if (!question) {
    throw new Error(`No unanswered questions found in session ${sessionId}.`);
  }

  // Grade answer via LLM
  const graded = await llm.gradeAnswer(question.question_text, question.expected_answer, userAnswer);

  // Update question record
  const updateQuestionStmt = db.prepare(`
    UPDATE quiz_questions
    SET user_answer = ?, score = ?, feedback = ?, answered_at = datetime('now')
    WHERE id = ?
  `);
  updateQuestionStmt.run(userAnswer, graded.score, graded.feedback, question.id);

  // Update SRS item for this topic
  updateTopicSrs(db, session.exam_id, question.topic_id, graded.score);

  // Log study session (2 minutes of active recall practice per question)
  const logStudyStmt = db.prepare(`
    INSERT INTO study_logs (exam_id, topic_id, minutes)
    VALUES (?, ?, ?)
  `);
  logStudyStmt.run(session.exam_id, question.topic_id, 2);

  // Calculate updated session stats
  const answeredStmt = db.prepare<[string], { count: number; avg_score: number; correct_count: number }>(`
    SELECT
      count(*) as count,
      coalesce(avg(score), 0) as avg_score,
      coalesce(sum(case when score >= 60 then 1 else 0 end), 0) as correct_count
    FROM quiz_questions
    WHERE session_id = ? AND answered_at IS NOT NULL
  `);
  const stats = answeredStmt.get(sessionId)!;

  // Decide whether to continue or finish
  // Standard 10 minute quiz targets 3-4 high quality questions
  const maxQuestions = Math.max(3, Math.min(6, Math.round(session.duration_minutes / 2.5)));
  const shouldFinish = stats.count >= maxQuestions;

  if (shouldFinish) {
    // End session
    const endSessionStmt = db.prepare(`
      UPDATE quiz_sessions
      SET status = 'completed', ended_at = datetime('now'), total_questions = ?, correct_count = ?, average_score = ?
      WHERE id = ?
    `);
    const finalAvg = Math.round(stats.avg_score);
    endSessionStmt.run(stats.count, stats.correct_count, finalAvg, sessionId);

    const spokenReply = `${graded.feedback} Quiz complete! You scored an average of ${finalAvg}% across ${stats.count} questions. Great job!`;

    return {
      sessionId,
      isComplete: true,
      score: graded.score,
      feedback: graded.feedback,
      correctAnswer: graded.correctAnswer,
      spokenReply,
      summary: {
        totalQuestions: stats.count,
        averageScore: finalAvg,
        correctCount: stats.correct_count
      }
    };
  }

  // Generate next question
  const examStmt = db.prepare<[number], ExamRow>(`SELECT * FROM exams WHERE id = ?`);
  const exam = examStmt.get(session.exam_id)!;

  // Pick topic: alternate with another weak topic or continue current
  const weakTopics = getWeakTopics(db, session.exam_id);
  const nextTopicInfo = weakTopics[stats.count % weakTopics.length];
  const nextTopicId = nextTopicInfo ? nextTopicInfo.topicId : question.topic_id;
  const nextTopicName = nextTopicInfo ? nextTopicInfo.name : 'this topic';

  // Gather past questions to avoid duplicates
  const pastStmt = db.prepare<[string], { question_text: string }>(`
    SELECT question_text FROM quiz_questions WHERE session_id = ?
  `);
  const pastQuestions = pastStmt.all(sessionId).map((p) => p.question_text);

  const nextQ = await llm.generateQuestion(exam.subject, nextTopicName, pastQuestions);

  const nextQuestionNumber = stats.count + 1;
  const insertNextQStmt = db.prepare(`
    INSERT INTO quiz_questions (session_id, topic_id, question_text, expected_answer)
    VALUES (?, ?, ?, ?)
  `);
  insertNextQStmt.run(sessionId, nextTopicId, nextQ.question, nextQ.expectedAnswer);

  const updateSessionIndexStmt = db.prepare(`
    UPDATE quiz_sessions
    SET total_questions = ?, current_question_index = ?, average_score = ?
    WHERE id = ?
  `);
  updateSessionIndexStmt.run(nextQuestionNumber, nextQuestionNumber, Math.round(stats.avg_score), sessionId);

  const spokenReply = `${graded.feedback} Next question on ${nextTopicName}: ${nextQ.question}`;

  return {
    sessionId,
    isComplete: false,
    score: graded.score,
    feedback: graded.feedback,
    correctAnswer: graded.correctAnswer,
    spokenReply,
    nextQuestion: {
      questionNumber: nextQuestionNumber,
      questionText: nextQ.question,
      topicName: nextTopicName
    }
  };
}

/**
 * Ends a quiz session early and returns a voice-friendly performance summary.
 */
export function endQuiz(db: Database.Database, sessionId: string): EndQuizResult {
  const sessionStmt = db.prepare<[string], QuizSessionRow>(`
    SELECT * FROM quiz_sessions WHERE id = ?
  `);
  const session = sessionStmt.get(sessionId);

  if (!session) {
    throw new Error(`Quiz session ${sessionId} not found.`);
  }

  const answeredStmt = db.prepare<[string], { count: number; avg_score: number; correct_count: number }>(`
    SELECT
      count(*) as count,
      coalesce(avg(score), 0) as avg_score,
      coalesce(sum(case when score >= 60 then 1 else 0 end), 0) as correct_count
    FROM quiz_questions
    WHERE session_id = ? AND answered_at IS NOT NULL
  `);
  const stats = answeredStmt.get(sessionId)!;

  const finalAvg = Math.round(stats.avg_score);

  const endStmt = db.prepare(`
    UPDATE quiz_sessions
    SET status = 'completed', ended_at = datetime('now'), total_questions = ?, correct_count = ?, average_score = ?
    WHERE id = ?
  `);
  endStmt.run(stats.count, stats.correct_count, finalAvg, sessionId);

  let spokenSummary = '';
  if (stats.count === 0) {
    spokenSummary = "Quiz session ended. No questions were answered.";
  } else {
    spokenSummary = `Quiz ended early. You completed ${stats.count} questions with an average score of ${finalAvg}%. Your spaced repetition schedule has been updated.`;
  }

  return {
    sessionId,
    totalQuestions: session.total_questions,
    answeredQuestions: stats.count,
    averageScore: finalAvg,
    spokenSummary
  };
}
