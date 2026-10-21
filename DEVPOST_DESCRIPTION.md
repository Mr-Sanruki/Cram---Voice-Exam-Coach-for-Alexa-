# Devpost Project Submission: Cram

## Project Name
**Cram — Voice Exam Coach for Alexa+ (Powered by MCP & SM-2 Spaced Repetition)**

## Elevator Pitch
Cram transforms Alexa+ into an intelligent oral exam coach that conducts spoken active recall quizzes, dynamically generates personalized day-by-day study schedules, and optimizes retention using SuperMemo SM-2 spaced repetition over a self-hosted Model Context Protocol (MCP) server.

---

## 🏆 Track Selection
* **Track**: Alexa+ Track (Self-hosted MCP Server / Agent Skill)

---

## 💡 Inspiration
College and university students face relentless midterm and final exam schedules across heavy technical subjects (such as Discrete Mathematics, Algorithms, and Computer Architecture). Most students rely on passive re-reading, which cognitive science proves is the least effective study strategy. Meanwhile, active recall and spaced repetition are proven to double long-term memory retention—yet building manual flashcard decks is tedious. 

We asked: **What if your voice assistant was an active oral examiner?** Instead of staring at a screen, a student can study while walking, making breakfast, or relaxing: *"Alexa, quiz me on graph theory for 10 minutes."*

---

## ⚡ What It Does
* **Spoken Active Recall Quizzes**: Cram asks questions one by one, listens to the student's spoken response, grades the conceptual accuracy in real time, and provides supportive oral feedback with the correct concept.
* **SuperMemo SM-2 Spaced Repetition**: Each syllabus topic maintains an ease factor, repetition count, interval, and rolling mastery score (0-100%). Weak topics return sooner; mastered topics are pushed out.
* **Automated Day-by-Day Study Planner**: Allocates target daily study hours across remaining days until each exam, heavily prioritizing the student's weakest syllabus areas.
* **Simulated Alexa+ Web Experience**: A voice web app with an Alexa-style pulsating holographic glow ring, Web Speech API recognition and synthesis, and live conversation transcripts.
* **Live MCP Server Inspector**: A side-panel proving real-time MCP tool invocations, execution latencies, and JSON-RPC payloads.

---

## 🔌 How We Built It & How It Uses MCP
Cram is architected around the official **Model Context Protocol (MCP)** specification (version `2025-11-25`):
* **Self-Hosted Streamable HTTP Transport**: Implemented in `src/mcp/transport.ts` on `/mcp`. Handles HTTP POST for JSON-RPC messages, HTTP GET for Server-Sent Events (SSE), and DELETE for session termination, with strict `Mcp-Session-Id` tracking and DNS rebinding origin validation.
* **11 First-Class MCP Tools**: Registered using `@modelcontextprotocol/sdk` and `zod` schemas:
  1. `add_exam`
  2. `list_exams`
  3. `add_topics`
  4. `make_study_plan`
  5. `get_today_plan`
  6. `start_quiz`
  7. `answer_question`
  8. `end_quiz`
  9. `get_progress`
  10. `log_study_session`
  11. `weak_topics`
* **MCP Resource**: Exposes `cram://progress/summary` for external agents to inspect academic progress.
* **MCP Prompt**: Exposes `exam_coach` system persona enforcing concise, under-2-sentence spoken responses.
* **Real MCP Client Integration**: The backend simulator in `src/api/agent.ts` connects as an actual MCP Client (`StreamableHTTPClientTransport`) to discover and invoke tools dynamically over HTTP.
* **$0 Full-Stack Architecture**: Single-file SQLite (`better-sqlite3`), Google Gemini Free Tier (`gemini-1.5-flash`) with Groq fallback and deterministic offline mock, and static vanilla frontend served via Express.

---

## 🧗 Challenges We Ran Into
1. **Multi-Session Lifecycle in Streamable HTTP**: In the `@modelcontextprotocol/sdk`, a single `StreamableHTTPServerTransport` instance is designed for a single stateful session; re-initializing throws an error. We designed a session management layer that routes requests by `Mcp-Session-Id` and creates new transport sessions dynamically.
2. **Audio-Friendly Formatting**: Standard LLM outputs contain markdown, bolding, and bullet lists that sound unnatural when spoken by text-to-speech. We established a strict dual-output pattern: voice-friendly plain sentences in `content.text`, and rich data structures in `structuredContent`.
3. **Loopback Origin Security vs Ephemeral Test Ports**: Strict DNS rebinding protection can reject random test ports. We calibrated our middleware to recognize loopback origins safely while maintaining protection in production.

---

## 🏅 Accomplishments We're Proud Of
* 100% compliant with the latest MCP Streamable HTTP 2025-11-25 specification.
* Fully automated test suite with 13 passing unit and integration tests spinning up real MCP transports.
* Built-in zero-dependency deterministic fallback ensuring the app runs flawlessly for $0 even without API keys.
* A responsive, high-aesthetic Alexa+ web simulator with real-time audio synthesis and live MCP tool inspection.

---

## 🔮 What's Next for Cram
* **Native Alexa+ Skill Packaging**: Publishing as an official certified skill on the Alexa Skills Store once third-party MCP skill endpoints open publicly.
* **Syllabus & PDF Ingestion**: Allowing students to upload course syllabus PDFs or lecture slides to automatically extract exams, dates, and topics.
* **Collaborative Study Sessions**: Multi-device voice quizzing with study group leaderboards and shared spaced repetition schedules.
