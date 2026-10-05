// Programmatic entry point — import these to embed or extend paper-mcp.
//
//   import { createEditorHost } from 'paper-mcp';
//   const host = await createEditorHost({ fileId });
//   await host.start();
//   const { tools } = await host.getConfig({ name: 'my-app' });

export { createEditorHost, parseFileId, AuthRequiredError } from './editor/host.js';
export { startMcpServer } from './mcp/server.js';
export { startRelay } from './mcp/relay.js';
export { login } from './auth/browser-login.js';
export { profileDir } from './auth/session.js';
export { ENVIRONMENTS, DESKTOP_MCP, resolveEnv, SERVER_INFO } from './config.js';
