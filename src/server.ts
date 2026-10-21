import express from 'express';
import cors from 'cors';
import path from 'node:path';
import dotenv from 'dotenv';
import { getDb, closeDb } from './db/db.js';
import { createMcpRouter } from './mcp/transport.js';
import { createAgentRouter } from './api/agent.js';

import Database from 'better-sqlite3';

dotenv.config();

export function createApp(customDbPath?: string): { app: express.Express; db: Database.Database } {
  const app = express();
  const db = getDb(customDbPath);

  // Cross-Origin Resource Sharing
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'Last-Event-ID', 'Accept', 'Origin']
  }));

  // Body parser for JSON
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Mount MCP Streamable HTTP endpoint
  app.use('/mcp', createMcpRouter(db));

  // Mount REST & Agent APIs
  app.use('/api', createAgentRouter(db));

  // Serve static web frontend
  const webPath = path.resolve(process.cwd(), 'web');
  app.use(express.static(webPath));

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'cram-alexa-mcp',
      time: new Date().toISOString()
    });
  });

  // Catch-all to serve index.html for SPA frontend
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/mcp') || req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(webPath, 'index.html'));
  });

  return { app, db };
}

// Start server only if executed directly as entrypoint
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('server.ts') ||
  process.argv[1].endsWith('server.js')
);

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  const port = process.env.PORT || 3000;
  const { app } = createApp();

  const server = app.listen(port, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Cram - Alexa+ Voice Exam Coach with MCP Server`);
    console.log(`📡 Server running on http://localhost:${port}`);
    console.log(`🔌 MCP Streamable HTTP endpoint: http://localhost:${port}/mcp`);
    console.log(`🎙️  Alexa+ Web Simulator: http://localhost:${port}`);
    console.log(`=======================================================`);
  });

  const gracefulShutdown = () => {
    console.log('\nShutting down Cram server...');
    server.close(() => {
      closeDb();
      console.log('Database and server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}
