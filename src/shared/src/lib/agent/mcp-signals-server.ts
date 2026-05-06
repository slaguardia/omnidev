/**
 * Lazy-initialized in-process MCP HTTP server that advertises two tools the
 * Ralph stage runner uses as structured signals from the agent:
 *
 *   - mark_stage_complete: agent calls when all stage work is done; the
 *     Ralph auto-loop terminates.
 *   - request_clarification: agent calls when blocked on user input;
 *     questions are surfaced to the human-in-the-loop UI.
 *
 * The server's tool handlers do trivial bookkeeping (return success). The
 * load-bearing signal is observed via the AgentEvent.tool_call stream that
 * CursorSdkAgent already produces — see executeAgentRun in agent-runner.ts.
 *
 * One server is started per worker process on first use, on an ephemeral
 * localhost port. Cursor SDK agent runs receive the URL via mcpServers
 * config on Agent.create. Stateless mode: each agent connection spawns a
 * fresh McpServer instance per request, mirroring the SDK's
 * simpleStatelessStreamableHttp example.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { z } from 'zod';
import type { AddressInfo } from 'node:net';

let cachedUrlPromise: Promise<string> | null = null;

/**
 * Get (and lazy-start) the MCP signals server URL. Subsequent calls return
 * the cached URL without starting a second server.
 *
 * Concurrent first calls are coalesced via the cached promise so we never
 * race-start two servers under parallel agent runs.
 */
export function getMcpSignalsUrl(): Promise<string> {
  if (cachedUrlPromise === null) {
    cachedUrlPromise = startServer().catch((err) => {
      // Reset on failure so the next call can retry.
      cachedUrlPromise = null;
      throw err;
    });
  }
  return cachedUrlPromise;
}

function buildMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'omnidev-signals',
      version: '1.0.0',
    },
    { capabilities: { logging: {} } }
  );

  // Tool: mark the current stage complete. No params; the agent invokes it
  // when finished and the auto-loop terminates on the resulting tool_call
  // event observed by executeAgentRun.
  server.registerTool(
    'mark_stage_complete',
    {
      description:
        'Call this tool when all work for the current stage is done. ' +
        'The Ralph auto-loop terminates and the stage is marked complete.',
      inputSchema: {},
    },
    async () => ({
      content: [{ type: 'text', text: 'Stage marked complete.' }],
    })
  );

  // Tool: request user clarification. Carries a structured list of questions.
  server.registerTool(
    'request_clarification',
    {
      description:
        'Call this tool when blocked on user input before you can proceed. ' +
        'Pass each question as a separate string in the questions array. ' +
        'The stage pauses and the questions are surfaced to the human reviewer.',
      inputSchema: {
        questions: z
          .array(z.string().min(1))
          .min(1)
          .describe('One or more questions to surface to the user.'),
      },
    },
    async ({ questions }) => ({
      content: [
        {
          type: 'text',
          text: `Recorded ${questions.length} question(s) for human review.`,
        },
      ],
    })
  );

  return server;
}

async function startServer(): Promise<string> {
  const app = createMcpExpressApp();

  app.post('/mcp', async (req, res) => {
    // Stateless: build a fresh McpServer + transport per request. Mirrors
    // the SDK's simpleStatelessStreamableHttp example. Tool handlers are
    // pure functions so per-request servers carry no state across calls.
    const server = buildMcpServer();
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      console.error('[MCP-SIGNALS] Error handling request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', (_req, res) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed.' },
        id: null,
      })
    );
  });

  app.delete('/mcp', (_req, res) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed.' },
        id: null,
      })
    );
  });

  return new Promise<string>((resolve, reject) => {
    const httpServer = app.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address() as AddressInfo | null;
      if (!addr) {
        reject(new Error('MCP signals server bound but address() returned null'));
        return;
      }
      const url = `http://127.0.0.1:${addr.port}/mcp`;
      console.log(`[MCP-SIGNALS] Listening on ${url}`);
      resolve(url);
    });
    httpServer.once('error', reject);
  });
}
