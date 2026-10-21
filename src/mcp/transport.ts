import { Request, Response, Router } from 'express';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createCramMcpServer } from './createServer.js';

interface ActiveMcpSession {
  sessionId: string;
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  createdAt: number;
  lastActive: number;
}

/**
 * Creates and mounts the /mcp router handling Streamable HTTP (spec version 2025-11-25).
 * Supports POST (JSON-RPC), GET (SSE stream), and DELETE (session termination).
 */
export function createMcpRouter(db: Database.Database): Router {
  const router = Router();
  const sessions = new Map<string, ActiveMcpSession>();

  // Parse allowed origins from environment
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000';
  const allowedOrigins = allowedOriginsEnv.split(',').map((o) => o.trim().toLowerCase());
  const publicBase = process.env.PUBLIC_BASE_URL?.trim().toLowerCase();
  if (publicBase && !allowedOrigins.includes(publicBase)) {
    allowedOrigins.push(publicBase);
  }

  // Session cleanup every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [id, sess] of sessions.entries()) {
      // Expire sessions inactive for 30 minutes
      if (now - sess.lastActive > 30 * 60 * 1000) {
        sess.transport.close().catch(() => {});
        sessions.delete(id);
      }
    }
  }, 5 * 60 * 1000).unref();

  // Middleware: Origin validation & optional Bearer token auth
  router.use((req: Request, res: Response, next) => {
    // 1. Origin header validation (DNS rebinding protection)
    const origin = req.headers['origin'];
    if (origin && typeof origin === 'string') {
      const normalized = origin.trim().toLowerCase();
      const isLoopback = normalized.startsWith('http://localhost') ||
                         normalized.startsWith('http://127.0.0.1') ||
                         normalized.startsWith('http://[::1]');
      const isAllowed = isLoopback ||
                        allowedOrigins.includes('*') ||
                        allowedOrigins.some((ao) => normalized === ao || normalized.startsWith(ao));
      if (!isAllowed) {
        res.status(403).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: `Forbidden: Origin '${origin}' is not allowed` },
          id: null
        });
        return;
      }
    }

    // 2. Optional Bearer Auth
    const expectedToken = process.env.MCP_AUTH_TOKEN?.trim();
    if (expectedToken) {
      const authHeader = req.headers['authorization'];
      if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
        res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Unauthorized: Missing or invalid Bearer token' },
          id: null
        });
        return;
      }
    }

    next();
  });

  // Handler for /mcp (POST, GET, DELETE)
  router.all('/', async (req: Request, res: Response) => {
    const rawSessionId = req.headers['mcp-session-id'];
    const sessionId = typeof rawSessionId === 'string' ? rawSessionId.trim() : undefined;

    // A. Request has an existing Session ID
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: `Session not found: ${sessionId}` },
          id: null
        });
        return;
      }

      session.lastActive = Date.now();

      try {
        await session.transport.handleRequest(req, res, req.body);
      } catch (err) {
        console.error(`Error in session ${sessionId}:`, err);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: (err as Error).message },
            id: null
          });
        }
      }
      return;
    }

    // B. Initialization request (POST without session ID)
    if (req.method === 'POST') {
      try {
        let createdSessionId = '';
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => {
            createdSessionId = randomUUID();
            return createdSessionId;
          },
          onsessionclosed: (closedId) => {
            sessions.delete(closedId);
          }
        });

        const server = createCramMcpServer(db);
        await server.connect(transport);

        // Handle the initialization request
        await transport.handleRequest(req, res, req.body);

        const activeId = transport.sessionId || createdSessionId;
        if (activeId) {
          sessions.set(activeId, {
            sessionId: activeId,
            transport,
            server,
            createdAt: Date.now(),
            lastActive: Date.now()
          });
        }
      } catch (err) {
        console.error('Failed to initialize MCP session:', err);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: (err as Error).message },
            id: null
          });
        }
      }
      return;
    }

    // C. Non-POST without session ID is rejected per Streamable HTTP spec
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Bad Request: Mcp-Session-Id header is required for this operation' },
      id: null
    });
  });

  return router;
}
