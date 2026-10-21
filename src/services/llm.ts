import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

export interface GeneratedQuestion {
  question: string;
  expectedAnswer: string;
}

export interface GradedAnswer {
  score: number;
  feedback: string;
  correctAnswer: string;
}

export interface PlannedDayTask {
  topic: string;
  minutes: number;
  goal: string;
}

export interface PlannedDay {
  dayOffset: number;
  date: string;
  tasks: PlannedDayTask[];
}

export interface AgentChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AgentToolDeclaration {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AgentChatResult {
  reply?: string;
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

// Built-in curated question bank for instant zero-dependency $0 mock fallback
const CURATED_QUESTIONS: Record<string, GeneratedQuestion[]> = {
  'graph theory': [
    {
      question: "In graph theory, what is the maximum number of edges in a simple undirected graph with n vertices?",
      expectedAnswer: "n times (n minus 1) divided by 2 edges."
    },
    {
      question: "What is the difference between an Eulerian path and a Hamiltonian path?",
      expectedAnswer: "An Eulerian path visits every edge exactly once, while a Hamiltonian path visits every vertex exactly once."
    },
    {
      question: "State the Handshaking Lemma regarding vertex degrees and edge count.",
      expectedAnswer: "The sum of degrees of all vertices equals twice the total number of edges."
    }
  ],
  'trees': [
    {
      question: "For a binary tree with n nodes, what is the minimum possible height?",
      expectedAnswer: "Floor of log base 2 of n."
    },
    {
      question: "In an in-order traversal of a Binary Search Tree, in what order are the keys processed?",
      expectedAnswer: "The keys are processed in strictly ascending or sorted order."
    }
  ],
  'propositional logic': [
    {
      question: "What does it mean for a propositional formula to be a tautology?",
      expectedAnswer: "It is true under every possible truth assignment or interpretation of its variables."
    },
    {
      question: "State De Morgan's Law for the negation of a conjunction (not of P and Q).",
      expectedAnswer: "Not P or not Q."
    }
  ],
  'divide and conquer': [
    {
      question: "What is the average and worst-case time complexity of QuickSort?",
      expectedAnswer: "Average case is O(n log n), and worst case is O(n squared)."
    },
    {
      question: "What is the recurrence relation for standard MergeSort?",
      expectedAnswer: "T(n) = 2T(n/2) + O(n), giving O(n log n) total time."
    }
  ],
  'dynamic programming': [
    {
      question: "What two key properties must an optimization problem exhibit for Dynamic Programming to apply?",
      expectedAnswer: "Optimal substructure and overlapping subproblems."
    },
    {
      question: "What is the time complexity of solving the 0/1 Knapsack problem using dynamic programming with n items and capacity W?",
      expectedAnswer: "O(n times W), which is pseudo-polynomial."
    }
  ],
  'pipelining & hazards': [
    {
      question: "Name the three primary types of pipeline hazards in a RISC processor pipeline.",
      expectedAnswer: "Structural hazards, data hazards, and control or branch hazards."
    },
    {
      question: "How does operand forwarding or bypassing mitigate data hazards?",
      expectedAnswer: "It routes the result directly from an execution or memory stage to a preceding instruction without waiting for write-back."
    }
  ],
  'cache memory mapping': [
    {
      question: "What are the three common cache mapping architectures?",
      expectedAnswer: "Direct mapped, fully associative, and set associative mapping."
    },
    {
      question: "In a set-associative cache, what formula determines the set index from the memory address?",
      expectedAnswer: "The set index equals the block address modulo the total number of sets."
    }
  ]
};
/**
 * Strips properties that Google Gemini API rejects in function declaration parameters,
 * such as $schema, additionalProperties, default, etc.
 */
export function cleanSchemaForGemini(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(cleanSchemaForGemini);

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$schema' || key === 'additionalProperties' || key === 'default') {
      continue;
    }
    cleaned[key] = cleanSchemaForGemini(value);
  }
  return cleaned;
}

/**
 * Helper to wrap any promise with a strict timeout so voice responses never stall
 */
export function withTimeout<T>(promise: Promise<T>, ms: number = 3800): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    )
  ]);
}


export class LlmService {
  private geminiKey?: string;
  private groqKey?: string;
  private geminiClient?: GoogleGenerativeAI;

  constructor() {
    this.geminiKey = process.env.GEMINI_API_KEY?.trim();
    this.groqKey = process.env.GROQ_API_KEY?.trim();

    if (this.geminiKey) {
      try {
        this.geminiClient = new GoogleGenerativeAI(this.geminiKey);
      } catch (e) {
        console.warn('Failed to initialize Gemini client:', e);
      }
    }
  }

  /**
   * Generates a voice-friendly oral quiz question for an exam topic.
   */
  async generateQuestion(
    subject: string,
    topic: string,
    previousQuestions: string[] = []
  ): Promise<GeneratedQuestion> {
    const prompt = `You are Cram, an oral exam coach for Alexa+.
Generate ONE concise spoken exam question for the subject "${subject}" and topic "${topic}".
The question should test core understanding, suitable for a spoken voice response (1-2 sentences).
Do NOT include markdown, bullet points, or multiple choice options.
Return your answer in strictly valid JSON format with keys:
{
  "question": "Your question here?",
  "expectedAnswer": "Concise key concepts expected in the student's answer."
}
${previousQuestions.length > 0 ? `Avoid repeating previous questions: ${previousQuestions.join(' | ')}` : ''}`;

    // 1. Try Gemini
    if (this.geminiClient) {
      try {
        const model = this.geminiClient.getGenerativeModel({
          model: 'gemini-3.8-flash',
          generationConfig: { responseMimeType: 'application/json' }
        });
        const resp = await withTimeout(model.generateContent(prompt), 3800);
        const text = resp.response.text();
        const parsed = JSON.parse(text);
        if (parsed.question && parsed.expectedAnswer) {
          return {
            question: parsed.question.trim(),
            expectedAnswer: parsed.expectedAnswer.trim()
          };
        }
      } catch (err) {
        console.warn('Gemini question generation error, trying fallback:', (err as Error).message);
      }
    }

    // 2. Try Groq
    if (this.groqKey) {
      try {
        const groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.groqKey}`
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
          })
        });
        if (groqResp.ok) {
          const groqData = (await groqResp.json()) as any;
          const parsed = JSON.parse(groqData.choices[0].message.content);
          if (parsed.question && parsed.expectedAnswer) {
            return {
              question: parsed.question.trim(),
              expectedAnswer: parsed.expectedAnswer.trim()
            };
          }
        }
      } catch (err) {
        console.warn('Groq question generation error, trying fallback:', (err as Error).message);
      }
    }

    // 3. High quality Deterministic Mock Fallback ($0, zero keys needed)
    const normalized = topic.toLowerCase().trim();
    for (const [key, qList] of Object.entries(CURATED_QUESTIONS)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        const unused = qList.filter((q) => !previousQuestions.some((pq) => pq.includes(q.question.slice(0, 20))));
        const selected = unused.length > 0 ? unused[Math.floor(Math.random() * unused.length)] : qList[0];
        return selected;
      }
    }

    // Generic fallback for any other topic
    return {
      question: `In ${subject}, what is the fundamental purpose and core mechanism of ${topic}?`,
      expectedAnswer: `A clear explanation of how ${topic} operates and why it is used in ${subject}.`
    };
  }

  /**
   * Grades a student's spoken answer against the expected answer.
   */
  async gradeAnswer(
    question: string,
    expectedAnswer: string,
    userAnswer: string
  ): Promise<GradedAnswer> {
    const prompt = `You are Cram, a voice exam coach for Alexa+.
A student just answered an exam question out loud.
Question: "${question}"
Target Answer / Key Concepts: "${expectedAnswer}"
Student Answer: "${userAnswer}"

Grade the student's answer.
Criteria:
- Score from 0 to 100 based on conceptual accuracy.
- Spoken feedback: 1-2 SHORT sentences, conversational and supportive. No markdown.
- Correct answer: A crisp 1-sentence spoken explanation of the correct concept.

Respond in strictly valid JSON:
{
  "score": 85,
  "feedback": "Great job, you nailed the core concept!",
  "correctAnswer": "The exact concept summary."
}`;

    // 1. Try Gemini
    if (this.geminiClient) {
      try {
        const model = this.geminiClient.getGenerativeModel({
          model: 'gemini-3.8-flash',
          generationConfig: { responseMimeType: 'application/json' }
        });
        const resp = await withTimeout(model.generateContent(prompt), 3800);
        const text = resp.response.text();
        const parsed = JSON.parse(text);
        if (typeof parsed.score === 'number' && parsed.feedback && parsed.correctAnswer) {
          return {
            score: Math.min(100, Math.max(0, Math.round(parsed.score))),
            feedback: parsed.feedback.trim(),
            correctAnswer: parsed.correctAnswer.trim()
          };
        }
      } catch (err) {
        console.warn('Gemini grading error, trying fallback:', (err as Error).message);
      }
    }

    // 2. Try Groq
    if (this.groqKey) {
      try {
        const groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.groqKey}`
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
          })
        });
        if (groqResp.ok) {
          const groqData = (await groqResp.json()) as any;
          const parsed = JSON.parse(groqData.choices[0].message.content);
          if (typeof parsed.score === 'number') {
            return {
              score: Math.min(100, Math.max(0, Math.round(parsed.score))),
              feedback: parsed.feedback.trim(),
              correctAnswer: parsed.correctAnswer.trim()
            };
          }
        }
      } catch (err) {
        console.warn('Groq grading error, trying fallback:', (err as Error).message);
      }
    }

    // 3. Deterministic Mock Evaluator ($0 fallback)
    const cleanUser = userAnswer.toLowerCase().trim();
    if (!cleanUser || cleanUser === "i don't know" || cleanUser === "no idea" || cleanUser === "pass" || cleanUser === "skip") {
      return {
        score: 0,
        feedback: `No worries! The correct answer is: ${expectedAnswer}.`,
        correctAnswer: expectedAnswer
      };
    }

    // Keyword matching overlap
    const expectedWords = expectedAnswer
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3);

    let matchCount = 0;
    for (const w of expectedWords) {
      if (cleanUser.includes(w)) {
        matchCount++;
      }
    }

    const overlap = expectedWords.length > 0 ? matchCount / expectedWords.length : 0.5;
    let score = Math.round(30 + overlap * 65);
    if (cleanUser.length > 15 && score < 50) score = 55;
    if (cleanUser.length < 5 && score > 40) score = 30;
    score = Math.min(95, Math.max(10, score));

    let feedback = '';
    if (score >= 80) {
      feedback = "Spot on! That was a clear and accurate explanation.";
    } else if (score >= 60) {
      feedback = `Good attempt! You hit key points. Remember: ${expectedAnswer}.`;
    } else {
      feedback = `That's not quite right. The correct answer is: ${expectedAnswer}.`;
    }

    return {
      score,
      feedback,
      correctAnswer: expectedAnswer
    };
  }

  /**
   * Agentic loop tool calling using LLM.
   */
  async agentChat(
    messages: AgentChatMessage[],
    tools: AgentToolDeclaration[]
  ): Promise<AgentChatResult> {
    const systemPrompt = `You are Cram, an intelligent voice exam coach for Alexa+.
Your mission: Help students master their upcoming exams through active recall and spaced repetition.
Rules:
1. Always keep responses voice-friendly: short, conversational, under 2 sentences. No markdown formatting.
2. Select and call the appropriate MCP tool whenever the student asks to add exams, view plans, take a quiz, check progress, etc.
3. If no tool is needed, respond with a supportive spoken reply.`;

    // 1. Try Gemini function calling
    if (this.geminiClient) {
      try {
        const model = this.geminiClient.getGenerativeModel({
          model: 'gemini-3.8-flash',
          systemInstruction: systemPrompt
        });

        // Convert tools to Gemini format with cleaned OpenAPI schemas (strip $schema, additionalProperties)
        const functionDeclarations = tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: cleanSchemaForGemini(t.inputSchema)
        }));

        const chat = model.startChat({
          tools: [{ functionDeclarations }]
        });

        const lastUserMsg = messages[messages.length - 1]?.content || '';
        const result = await withTimeout(chat.sendMessage(lastUserMsg), 3800);
        const calls = result.response.functionCalls();

        if (calls && calls.length > 0) {
          return {
            toolCalls: calls.map((c) => ({
              name: c.name,
              arguments: (c.args as Record<string, unknown>) || {}
            }))
          };
        }

        const reply = result.response.text();
        return { reply: reply.replace(/[*_#`]/g, '').trim() };
      } catch (err) {
        console.warn('Gemini agent chat failed, falling back to heuristic planner:', (err as Error).message);
      }
    }

    // 2. High-precision rule-based Intent Matcher for $0 operation & robust voice fallback
    const lastMsg = (messages[messages.length - 1]?.content || '').toLowerCase().trim();

    // Intent: stop / exit / cancel
    if (
      lastMsg.startsWith('stop') ||
      lastMsg.startsWith('exit') ||
      lastMsg.startsWith('cancel') ||
      lastMsg.startsWith('quit') ||
      lastMsg.includes('stop quiz') ||
      lastMsg.includes('end quiz') ||
      lastMsg.includes('finish quiz') ||
      lastMsg === 'nevermind' ||
      lastMsg === 'bye'
    ) {
      return {
        reply: "Understood. What would you like to work on next?"
      };
    }

    // Intent: add exam (robust against speech recognition errors: "add"->"and"/"at", "exam"->"income")
    const hasAddVerb = /(?:add|and|ad|at|schedule|register|create|put|set|enter|new)/i.test(lastMsg);
    const hasExamNoun = /(?:exam|income|test|midterm|finals?|paper)/i.test(lastMsg);
    const hasDateIndicator = /(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|tomorrow|today|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?[a-z]+|[a-z]+\s+\d{1,2}|2026)/i.test(lastMsg);

    if ((hasAddVerb && hasExamNoun) || (hasExamNoun && hasDateIndicator)) {
      // Extract subject
      let subject = '';
      const subjMatch = lastMsg.match(/(?:add|and|ad|at|schedule|register|create|put|set|enter|new)?\s*(?:my\s+)?([A-Za-z0-9+#]+)\s+(?:exam|income|test|midterm|finals?|paper)/i);
      if (subjMatch && subjMatch[1] && !['the', 'an', 'a', 'my', 'new', 'and', 'add'].includes(subjMatch[1].toLowerCase())) {
        subject = subjMatch[1].trim();
      } else {
        const forMatch = lastMsg.match(/(?:exam|income|test|midterm)\s+(?:for|in|on)\s+([A-Za-z0-9+#]+)/i);
        if (forMatch && forMatch[1]) {
          subject = forMatch[1].trim();
        }
      }

      // Normalize common speech errors for subject
      if (/^max$/i.test(subject) || /^mats?$/i.test(subject)) {
        subject = 'MATH';
      } else if (/^english$/i.test(subject)) {
        subject = 'ENGLISH';
      } else if (subject) {
        subject = subject.toUpperCase();
      } else {
        subject = 'EXAM';
      }

      // Parse spoken date into real YYYY-MM-DD
      const examDate = parseSpokenDate(lastMsg);

      // Check optional topics: e.g. "with topics algebra, calculus"
      let topics: string[] | undefined;
      const topicsMatch = lastMsg.match(/(?:with|covering)?\s*topics?\s+(.+)$/i);
      if (topicsMatch) {
        topics = topicsMatch[1]
          .split(/,|and/)
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
      }

      return {
        toolCalls: [
          {
            name: 'add_exam',
            arguments: {
              subject,
              examDate,
              ...(topics && topics.length > 0 ? { topics } : {})
            }
          }
        ]
      };
    }

    // Intent: start quiz / quiz me
    if (
      lastMsg.includes('quiz') ||
      lastMsg.includes('test me') ||
      lastMsg.includes('practice') ||
      lastMsg.includes('start quiz')
    ) {
      const minutesMatch = lastMsg.match(/(\d+)\s*(?:minutes?|mins?)/);
      const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 10;

      let topic: string | undefined;
      const onTopicMatch = lastMsg.match(/(?:on|about)\s+([a-zA-Z\s]+?)(?:\s+for|\s+in|\s*$)/i);
      if (onTopicMatch) {
        topic = onTopicMatch[1].trim();
      }

      return {
        toolCalls: [
          {
            name: 'start_quiz',
            arguments: {
              examId: 1, // default to primary active exam
              topic,
              minutes
            }
          }
        ]
      };
    }

    // Intent: make study plan (including speech recognition mis-transcription "steady plan")
    if (
      lastMsg.includes('study plan') ||
      lastMsg.includes('steady plan') ||
      lastMsg.includes('make me a plan') ||
      lastMsg.includes('create a plan') ||
      lastMsg.includes('make a plan') ||
      lastMsg.includes('schedule plan')
    ) {
      const hoursMatch = lastMsg.match(/(\d+)\s*(?:hours?|hrs?)/);
      const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 2;

      return {
        toolCalls: [
          {
            name: 'make_study_plan',
            arguments: {
              examId: 1,
              hoursPerDay: hours
            }
          }
        ]
      };
    }

    // Intent: get today plan
    if (
      lastMsg.includes("today's plan") ||
      lastMsg.includes('plan for today') ||
      lastMsg.includes('plan today') ||
      (lastMsg.includes('plan') && lastMsg.includes('today')) ||
      lastMsg.includes('what should i study') ||
      lastMsg.includes('study plan today') ||
      lastMsg.includes('my plan') ||
      lastMsg.includes('schedule today') ||
      lastMsg.includes("today's schedule")
    ) {
      return {
        toolCalls: [
          {
            name: 'get_today_plan',
            arguments: {}
          }
        ]
      };
    }

    // Intent: list exams
    if (
      lastMsg.includes('list exams') ||
      lastMsg.includes('what exams') ||
      lastMsg.includes('my exams') ||
      lastMsg.includes('upcoming exams') ||
      lastMsg.includes('show exams')
    ) {
      return {
        toolCalls: [
          {
            name: 'list_exams',
            arguments: {}
          }
        ]
      };
    }

    // Intent: get progress / streak
    if (
      lastMsg.includes('progress') ||
      lastMsg.includes('streak') ||
      lastMsg.includes('how am i doing') ||
      lastMsg.includes('stats') ||
      lastMsg.includes('metrics')
    ) {
      return {
        toolCalls: [
          {
            name: 'get_progress',
            arguments: {}
          }
        ]
      };
    }

    // Intent: weak topics
    if (
      lastMsg.includes('weak') ||
      lastMsg.includes('weakest') ||
      lastMsg.includes('need work') ||
      lastMsg.includes('struggling')
    ) {
      return {
        toolCalls: [
          {
            name: 'weak_topics',
            arguments: { examId: 1 }
          }
        ]
      };
    }

    // Default voice assistant response
    return {
      reply: "I'm Cram, your Alexa+ exam coach. You can say 'quiz me on graph theory', 'make me a study plan', or 'what's my plan for today?'"
    };
  }
}

/**
 * Parses conversational dates into YYYY-MM-DD
 */
export function parseSpokenDate(input: string): string {
  const months: Record<string, number> = {
    january: 0, jan: 0,
    february: 1, feb: 1,
    march: 2, mar: 2,
    april: 3, apr: 3,
    may: 4,
    june: 5, jun: 5,
    july: 6, jul: 6,
    august: 7, aug: 7,
    september: 8, sep: 8, sept: 8,
    october: 9, oct: 9,
    november: 10, nov: 10,
    december: 11, dec: 11
  };

  const lower = input.toLowerCase();

  if (lower.includes('tomorrow')) {
    const d = new Date(Date.now() + 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (lower.includes('today')) {
    return new Date().toISOString().slice(0, 10);
  }

  // Look for "in X days"
  const inDaysMatch = lower.match(/in\s+(\d+)\s+days?/);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    const d = new Date(Date.now() + days * 86400000);
    return d.toISOString().slice(0, 10);
  }

  const pad = (n: number) => n.toString().padStart(2, '0');

  // Month + Day: e.g. "October 23rd", "Oct 23", "October 23 2026"
  const monthDayMatch = lower.match(/(?:on\s+)?([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?/);
  if (monthDayMatch && months[monthDayMatch[1]] !== undefined) {
    const month = months[monthDayMatch[1]];
    const day = parseInt(monthDayMatch[2], 10);
    const now = new Date();
    let year = monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : now.getFullYear();
    const candidate = new Date(year, month, day);
    if (!monthDayMatch[3] && candidate.getTime() < now.getTime() - 30 * 86400000) {
      year += 1;
    }
    return `${year}-${pad(month + 1)}-${pad(day)}`;
  }

  // Day + Month: e.g. "23rd October", "23 October", "21st of November 2026"
  const dayMonthMatch = lower.match(/(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+(?:of\s+)?)?([a-z]+)(?:\s+(\d{4}))?/);
  if (dayMonthMatch && months[dayMonthMatch[2]] !== undefined) {
    const day = parseInt(dayMonthMatch[1], 10);
    const month = months[dayMonthMatch[2]];
    const now = new Date();
    let year = dayMonthMatch[3] ? parseInt(dayMonthMatch[3], 10) : now.getFullYear();
    const candidate = new Date(year, month, day);
    if (!dayMonthMatch[3] && candidate.getTime() < now.getTime() - 30 * 86400000) {
      year += 1;
    }
    return `${year}-${pad(month + 1)}-${pad(day)}`;
  }

  // ISO: 2026-10-23
  const isoMatch = lower.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  // Default to 14 days from now if date not recognized
  return new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
}

export const llm = new LlmService();
