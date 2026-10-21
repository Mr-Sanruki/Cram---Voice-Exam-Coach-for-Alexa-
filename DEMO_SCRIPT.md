# 🎬 Cram — 2:30 Demo Video Script

**Target Duration**: 2 minutes, 30 seconds  
**Track**: Alexa+ (Amazon Developer Hackathon on Devpost)  
**Hook**: Lead with the killer feature in the first 20 seconds — an active voice quiz with live MCP tool calls executing in real-time.

---

## Shot-by-Shot Walkthrough

### 0:00 - 0:20 | The Hook: Spoken Active Recall with Live MCP Execution
* **Visual**: Screen capture of Cram at `http://localhost:3000`. The Alexa glowing orb is pulsing cyan. The MCP Inspector panel is open on the right side.
* **Presenter Spoken**:
  > *"Meet Cram, the voice exam coach for Alexa+ that turns passive studying into active recall. Watch what happens when I ask Alexa to quiz me."*
* **Presenter says to Cram** (click mic or type):
  > *"Alexa, quiz me on graph theory for 10 minutes."*
* **On Screen**:
  * Orb glows bright electric cyan (`.listening`).
  * Instant MCP Tool Call card appears in the inspector: `tool: start_quiz { examId: 1, topic: "graph theory", minutes: 10 }` (latency: ~20ms).
  * Alexa speaks: *"Starting a 10-minute quiz on Graph Theory for DSGT. First question: What is the maximum number of edges in a simple undirected graph with n vertices?"*
* **Presenter Spoken**:
  > *"Notice that right here in our live MCP Inspector: Alexa+ just executed an MCP tool call over Streamable HTTP to our self-hosted Cram server."*

---

### 0:20 - 0:50 | Real-Time Oral Grading & Spaced Repetition (SM-2)
* **Presenter says to Cram**:
  > *"n times n minus 1 divided by 2 edges."*
* **On Screen**:
  * Alexa ring enters `.processing` rotation, then `.speaking`.
  * MCP Inspector records `tool: answer_question { sessionId: "...", answer: "n times n minus 1 divided by 2 edges" }`.
  * Alexa speaks: *"Spot on! That was an accurate explanation. Next question on Trees: For a binary tree with n nodes, what is the minimum possible height?"*
* **Presenter Spoken**:
  > *"Behind the scenes, the Cram MCP server graded the oral answer, logged study minutes, and updated the SuperMemo SM-2 spaced repetition state for that exact syllabus topic."*

---

### 0:50 - 1:25 | Weak Topic Prioritization & Automated Study Planning
* **Presenter Spoken**:
  > *"College students often waste study time on things they already know. Cram uses SM-2 mastery scores to identify exactly where you are weak."*
* **Presenter says to Cram**:
  > *"Alexa, what are my weakest topics?"*
* **On Screen**:
  * MCP Inspector records `tool: weak_topics { examId: 1 }`.
  * Alexa speaks: *"Your weakest topics in DSGT are Graph Theory at 35% mastery and Recurrence Relations at 40%. Say 'quiz me on Graph Theory' to strengthen your recall."*
* **Presenter says to Cram**:
  > *"Alexa, make me a study plan."*
* **On Screen**:
  * MCP Inspector records `tool: make_study_plan { examId: 1, hoursPerDay: 2 }`.
  * Alexa speaks: *"Created a 14-day study plan for DSGT with 2 hours per day. Weakest topics are prioritized first."*

---

### 1:25 - 2:00 | The Student Dashboard Experience
* **Visual**: Presenter clicks the **"Dashboard"** tab at the top.
* **On Screen**:
  * Top metrics: 5-Day Study Streak (🔥), 160 Minutes Studied, 3 Upcoming Exams, 51% Average Mastery.
  * Upcoming Exams countdown cards: DSGT (in 14 days), AOA (in 21 days), COA (in 28 days).
  * Spaced Repetition Mastery bars showing real-time color-coded progress per topic.
  * Today's Study Plan checklist with interactive check-off capabilities.
* **Presenter Spoken**:
  > *"The student dashboard reflects real-time data directly from our embedded SQLite database. We see countdowns, our SM-2 mastery bars, and today's focused checklist generated specifically around our weakest topics."*

---

### 2:00 - 2:30 | MCP Architecture & $0 Deployment
* **Visual**: Switch to VS Code / terminal showing `src/mcp/transport.ts` and `src/server.ts`, then back to the web simulator.
* **Presenter Spoken**:
  > *"Architecturally, Cram is built on the official Model Context Protocol TypeScript SDK, fully compliant with the 2025-11-25 Streamable HTTP specification. It mounts on Express at `/mcp`, handles session IDs, SSE streams, origin validation for DNS rebinding protection, and optional bearer authentication.*
  >
  > *Best of all, Cram runs completely for $0: powered by SQLite, Web Speech API, Google Gemini free tier with Groq fallback, and instant deploy on Render.*
  >
  > *With Cram, exam preparation is hands-free, personalized, and scientifically scheduled. Thank you!"*

---

## 🎙️ Cheat Sheet: Exact Sentences to Say During Demo

1. **Start Oral Quiz**:
   > `"Quiz me on graph theory for 10 minutes"`
2. **Answer Question 1**:
   > `"n times n minus 1 divided by 2 edges"`
3. **Check Weak Topics**:
   > `"What are my weakest topics?"`
4. **Make Study Plan**:
   > `"Make me a study plan for DSGT"`
5. **Get Today's Plan**:
   > `"What is my study plan for today?"`
6. **List Exams**:
   > `"What upcoming exams do I have?"`
