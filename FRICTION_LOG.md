# Friction Log: Cram (Alexa+ Track Hackathon)

This log records unexpected behaviors, transport quirks, and integration roadblocks encountered while implementing the **Model Context Protocol (MCP)** Streamable HTTP transport and Alexa+ simulator, along with applied workarounds and actionable suggestions for SDK maintainers.

---

## Entry 1: Multi-Session Transport Lifecycle in Streamable HTTP

### Task Attempted
Support multiple client connections or reconnecting clients (e.g. Alexa+ sessions or parallel test suites) using a shared `StreamableHTTPServerTransport` instance.

### Steps Taken
1. Instantiated a single global `StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })`.
2. Attached it to `mcpServer.connect(transport)`.
3. Dispatched incoming requests on `POST /mcp` through `transport.handleRequest(req, res, req.body)`.
4. Connected Client 1, called tools, and closed Client 1.
5. Attempted to connect Client 2.

### Expected vs Actual
* **Expected**: The transport generates a new `Mcp-Session-Id` for Client 2 and handles the initialization request cleanly.
* **Actual**: Client 2 was rejected with HTTP 400: `{"jsonrpc": "2.0", "error": {"code": -32600, "message": "Invalid Request: Server already initialized"}, "id": null}`.

### Severity
* **High** (Blocks multi-tenant or re-entrant client connections).

### Workaround
Built a Session Router in `src/mcp/transport.ts`:
* When a POST request arrives without `Mcp-Session-Id` (initialization), instantiate a *new* `StreamableHTTPServerTransport` and new `McpServer` instance, record it in a `Map<string, ActiveMcpSession>`, and forward the request.
* For subsequent requests carrying `Mcp-Session-Id`, look up the matching transport in the Map and route accordingly.

### Actionable Suggestion
The `@modelcontextprotocol/sdk` should provide a built-in `MultiSessionStreamableHttpTransport` or session router helper that manages session instances and teardown automatically.

---

## Entry 2: DNS Rebinding Origin Validation with Ephemeral Ports

### Task Attempted
Enforce DNS rebinding protection against hostile web origins while running automated test suites that spin up the server on ephemeral ports (`server.listen(0)`).

### Steps Taken
1. Added origin validation checking `req.headers['origin']` against `ALLOWED_ORIGINS` (defaulting to `http://localhost:3000`).
2. Ran Vitest integration test suite `test/mcp.test.ts`.

### Expected vs Actual
* **Expected**: Local test connections on `127.0.0.1:<random-port>` should be recognized as safe local loopback traffic.
* **Actual**: Vitest threw `Error: Streamable HTTP error: Error POSTing to endpoint: {"jsonrpc": "2.0", "error": {"code": -32000, "message": "Forbidden: Origin 'http://127.0.0.1:64051' is not allowed"}}`.

### Severity
* **Medium** (Breaks CI/CD and automated test harnesses using random ports).

### Workaround
Updated origin validation in `src/mcp/transport.ts` to explicitly allow loopback origins (`localhost`, `127.0.0.1`, `[::1]`) regardless of ephemeral port, while still strictly enforcing configured domains in production environments.

### Actionable Suggestion
Provide an `isLoopbackOrigin(origin: string): boolean` utility in `@modelcontextprotocol/sdk/server` that recognizes standard RFC 6761 local loopback addresses and allows port wildcards.

---

## Entry 3: Streamable HTTP Client Mandatory Headers & Media Types

### Task Attempted
Connect external HTTP clients to `/mcp` without relying on internal SDK magic.

### Steps Taken
Sent a standard JSON POST request with `Content-Type: application/json` to `/mcp`.

### Expected vs Actual
* **Expected**: Server processes JSON-RPC payload and returns standard JSON-RPC response.
* **Actual**: Server rejected request with HTTP 406: `{"jsonrpc": "2.0", "error": {"code": -32000, "message": "Not Acceptable: Client must accept both application/json and text/event-stream"}, "id": null}`.

### Severity
* **Low / Medium** (Surprising to developers testing with standard REST tools like Postman, curl, or standard fetch).

### Workaround
Configured `StreamableHTTPClientTransport` with explicit `Accept: application/json, text/event-stream` headers, and documented the exact curl flags in the README and demo scripts.

### Actionable Suggestion
Include a note in the MCP Streamable HTTP Specification documentation emphasizing that clients MUST advertise `Accept: application/json, text/event-stream` even for single request/response operations.

---

## Entry 4: Voice-Friendly Tool Outputs for Text-to-Speech

### Task Attempted
Return structured exam data and study plans from MCP tools to Alexa+.

### Steps Taken
Initially returned rich markdown formatting (bullet points, bold subject headers, code formatting) in `content: [{ type: 'text', text: markdown }]`.

### Expected vs Actual
* **Expected**: Speech synthesis reads clean sentences.
* **Actual**: Voice assistant attempted to speak literal asterisks, brackets, and markdown hashes ("asterisk asterisk D S G T asterisk asterisk"), sounding unnatural.

### Severity
* **Medium** (Degrades the voice experience).

### Workaround
Architected a two-tier output format for all 11 MCP tools:
1. `content: [{ type: "text", text: voiceFriendlyText }]` — Strictly plain conversational sentences under 2 sentences, formatted specifically for speech synthesis.
2. `structuredContent: { ... }` — Rich JSON payload containing full structured metrics, countdowns, and topic arrays for the UI and inspector drawer.

### Actionable Suggestion
Voice-oriented MCP clients (like Alexa+) should recommend a prompt annotation or tool output convention that separates spoken audio summaries from visual display cards.
