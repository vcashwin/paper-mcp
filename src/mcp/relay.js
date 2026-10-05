import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { DESKTOP_MCP, SERVER_INFO } from '../config.js';
import { log } from '../log.js';

/**
 * Design B (bonus): a thin stdio -> HTTP relay to a RUNNING Paper Desktop app.
 * This is a dependency-free re-implementation of the bundled Go `paper mcp`
 * binary. It does NOT remove the need for the desktop app — it only removes the
 * need for Paper's shipped CLI. Use `mcp` (the default) for a truly standalone,
 * app-free server.
 *
 * @param {{ url?: string, clientName?: string }} [options]
 */
export async function startRelay(options = {}) {
  const url = options.url || DESKTOP_MCP.url;
  log.info(`Relaying stdio MCP to Paper Desktop at ${url}`);

  const upstream = new Client({ name: SERVER_INFO.name + '-relay', version: SERVER_INFO.version });
  try {
    await upstream.connect(new StreamableHTTPClientTransport(new URL(url)));
  } catch (err) {
    throw new Error(
      `Could not reach Paper Desktop's MCP server at ${url}. Is the Paper desktop app running? (${
        err instanceof Error ? err.message : String(err)
      })`
    );
  }

  const server = new Server({ name: SERVER_INFO.name, version: SERVER_INFO.version }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return await upstream.listTools();
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return await upstream.callTool(request.params);
  });

  await server.connect(new StdioServerTransport());
  log.info('Relay ready on stdio.');

  const shutdown = async () => {
    await server.close().catch(() => {});
    await upstream.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, upstream };
}
