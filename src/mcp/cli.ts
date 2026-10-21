import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getDb } from '../db/db.js';
import { createCramMcpServer } from './createServer.js';

async function main() {
  const db = getDb();
  const server = createCramMcpServer(db);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error('Cram MCP Server running on stdio');
}

main().catch((err) => {
  console.error('Error starting Cram MCP CLI:', err);
  process.exit(1);
});
