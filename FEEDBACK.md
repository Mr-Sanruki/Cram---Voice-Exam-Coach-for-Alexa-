# Product Feedback & SDK Evaluation: Cram

This document records first-hand feedback on the core SDKs and frameworks utilized while building **Cram** for the Amazon Developer Hackathon (Alexa+ Track).

---

## 1. Official Model Context Protocol SDK (`@modelcontextprotocol/sdk` v1.32.1)

### What I Used It For
* Implemented the MCP server over **Streamable HTTP** (`src/mcp/transport.ts`) per specification version `2025-11-25`.
* Registered 11 custom tools with Zod input schemas, structured outputs, and an MCP resource (`cram://progress/summary`) and prompt (`exam_coach`).
* Implemented the simulated Alexa+ backend agent acting as an MCP client connecting to `/mcp` over `StreamableHTTPClientTransport`.

### What Worked Well
* **First-Class Streamable HTTP Support**: The SDK already includes `StreamableHTTPServerTransport` and `StreamableHTTPClientTransport` matching protocol version `2025-11-25`, avoiding the need to write SSE framing from scratch.
* **Express & Web Standards Integration**: The `@hono/node-server` bridge handles standard Web streams and Node's `IncomingMessage`/`ServerResponse` smoothly.
* **Type Safety with Zod**: Tool parameter validation with Zod schemas maps cleanly to JSON-RPC request validation.

### What Needs Work
* **Stateful Single-Session Transport Limitation**: A single `StreamableHTTPServerTransport` instance currently throws `Invalid Request: Server already initialized` if a second client connects or sends an initialization request. To support multiple independent client sessions, developers must maintain their own session map (`Map<string, { transport, server }>`) and route requests manually by `Mcp-Session-Id`.
* **DNS Rebinding Middleware Flexibility**: Built-in DNS rebinding protection in `createMcpExpressApp` tightly couples host validation to hardcoded localhost strings, which rejects ephemeral ports in automated test environments unless configured manually.

### Onboarding Experience
* **Rating**: 8.5 / 10
* Clear documentation on the spec; imports in ESM are clean and well-typed.

### Would I Build With It Again?
* **Yes, absolutely**. It is fast becoming the universal standard for AI tool orchestration.

---

## 2. Google Gemini API (`@google/generative-ai` v0.24.1)

### What I Used It For
* Real-time generation of spoken exam questions tailored to student syllabus topics.
* Natural language grading of oral student responses (0-100 score + concise spoken feedback).
* Function calling in the Alexa+ conversational agent loop.

### What Worked Well
* **Free Tier Accessibility**: Generous free tier quotas on `gemini-1.5-flash` with zero billing requirements make it ideal for hackathons and prototype demos.
* **Structured Output (`responseMimeType: "application/json"`)**: Enforcing strict JSON schema responses eliminated parse failures during question generation and grading.
* **Low Latency**: Responses from `gemini-1.5-flash` averaged ~450ms, fast enough for interactive conversational voice pacing.

### What Needs Work
* **Occasional Rate Limiting Under Rapid Bursts**: If a user fires several speech inputs in rapid succession, the free tier RPM can trigger 429 status codes. Having the Groq fallback and deterministic fallback was essential to prevent user-facing crashes.

### Onboarding Experience
* **Rating**: 9 / 10
* Setting up an API key at [Google AI Studio](https://aistudio.google.com/) took under 60 seconds with no credit card required.

### Would I Build With It Again?
* **Yes**. Gemini 1.5/2.0 Flash is currently the best price-to-performance option for lightweight voice agents.

---

## 3. SQLite with `better-sqlite3` (v11.8.1)

### What I Used It For
* Storing all persistent state: exams, syllabus topics, SuperMemo SM-2 parameters (ease factor, interval, due dates), study plans, and historical logs.

### What Worked Well
* **Synchronous Simplicity**: Zero async/await boilerplate for database queries simplifies control flow in tool handlers.
* **Fast and Lightweight**: In-memory database mode (`:memory:`) runs integration tests in ~30ms with zero file system side effects.
* **Foreign Key Constraints & WAL Mode**: Reliable relational integrity with cascade deletes.

### What Needs Work
* **Prebuilt Binary Compilation**: On some platforms without build tools (`node-gyp`), native add-ons can occasionally require prebuild flags. However, v11.8.1 installed smoothly on modern Node 22.

### Onboarding Experience
* **Rating**: 9.5 / 10
* The gold standard for embedded Node.js database persistence.

### Would I Build With It Again?
* **Yes**. Ideal for self-contained, zero-cost single-node hackathon submissions.

---

## 4. Web Speech API (Browser `SpeechRecognition` & `SpeechSynthesis`)

### What I Used It For
* In-browser voice recognition (hands-free microphone input) and spoken text-to-speech feedback simulating the Alexa+ device experience.

### What Worked Well
* **Zero Cost & Zero Network Latency for Voice**: Runs natively in Chrome, Edge, and Safari without paying for third-party STT/TTS APIs like Whisper or ElevenLabs.
* **Customizable Speech Synthesis**: Speech pitch and rate settings match natural conversational pacing.

### What Needs Work
* **Cross-Browser Variance**: Firefox does not support `webkitSpeechRecognition` out of the box, necessitating the clean text input fallback provided in Cram.

### Onboarding Experience
* **Rating**: 8 / 10
* Simple standard browser APIs that make a voice hackathon demo accessible to any judge without hardware.

### Would I Build With It Again?
* **Yes**, specifically for voice assistant web simulations and demos.
