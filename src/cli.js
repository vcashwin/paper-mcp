#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { startMcpServer } from './mcp/server.js';
import { startRelay } from './mcp/relay.js';
import { login } from './auth/browser-login.js';
import { createEditorHost, AuthRequiredError } from './editor/host.js';
import { DESKTOP_MCP, resolveEnv, SERVER_INFO } from './config.js';
import { log } from './log.js';

const HELP = `paper-mcp ${SERVER_INFO.version} — run Paper (paper.design) as a local MCP server, no desktop app required.

Usage:
  paper-mcp <command> [options]

Commands:
  mcp        Start the MCP server over stdio (default). Hosts a headless Paper
             editor using your signed-in session.
  login      Open a browser to sign in to Paper once; the session is reused by
             later headless runs.
  doctor     Check Node, the browser, your sign-in, and Paper Desktop.
  relay      Thin stdio -> HTTP relay to a RUNNING Paper Desktop app (bonus;
             still needs the desktop app).
  help       Show this help.

Options:
  --file <id|url>     File to open on start (and the default tool target).
  --env <name>        Paper environment: production (default) or staging.
  --profile <dir>     Override the profile/session directory.
  --headful           Show the browser window (default: headless) for mcp/doctor.
  --client-name <s>   Identify this client to Paper (default: paper-mcp).
  --url <url>         relay only: Paper Desktop MCP URL (default: ${DESKTOP_MCP.url}).

First run:
  npx paper-mcp login
  npx paper-mcp doctor
Then register "npx paper-mcp mcp" as a stdio MCP server in your agent.
`;

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'mcp';
  const rest = argv[0] && !argv[0].startsWith('-') ? argv.slice(1) : argv;

  const { values } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      file: { type: 'string' },
      env: { type: 'string' },
      profile: { type: 'string' },
      headful: { type: 'boolean', default: false },
      'client-name': { type: 'string' },
      url: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });

  if (values.help || command === 'help') {
    process.stdout.write(HELP);
    return;
  }
  if (values.version) {
    process.stdout.write(`${SERVER_INFO.version}\n`);
    return;
  }

  /** @type {import('./editor/host.js').HostOptions & { clientName?: string }} */
  const hostOptions = {
    env: values.env,
    profile: values.profile,
    fileId: values.file,
    headless: !values.headful,
    clientName: values['client-name'],
  };

  switch (command) {
    case 'login':
      await login({ env: values.env, profile: values.profile });
      return;

    case 'mcp':
      await startMcpServer(hostOptions);
      return; // keeps running

    case 'relay':
      await startRelay({ url: values.url, clientName: values['client-name'] });
      return; // keeps running

    case 'doctor':
      await doctor(hostOptions);
      return;

    default:
      process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
      process.exitCode = 1;
  }
}

/** @param {import('./editor/host.js').HostOptions} hostOptions */
async function doctor(hostOptions) {
  /** @param {string} s */
  const out = (s) => process.stdout.write(s + '\n');
  const env = resolveEnv(hostOptions.env);
  out(`paper-mcp ${SERVER_INFO.version}`);
  out(`node           ${process.version}`);
  out(`platform       ${process.platform}/${process.arch}`);
  out(`environment    ${env.key} (${env.app})`);

  // Browser + sign-in + handlers, in one real launch.
  let host;
  try {
    host = await createEditorHost({ ...hostOptions, readyTimeoutMs: 20_000 });
  } catch (err) {
    out(`browser        ✗ could not launch (${err instanceof Error ? err.message : String(err)})`);
    out('\nFix: `npx playwright install chromium`, or install Google Chrome.');
    process.exitCode = 1;
    return;
  }
  out('browser        ✓ launched');

  try {
    await host.start();
    const config = await host.getConfig({ name: 'paper-mcp-doctor', transport: 'webmcp' });
    out('sign-in        ✓ authenticated');
    out(`handlers       ✓ ${config.tools?.length ?? 0} tools available`);
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      out('sign-in        ✗ not signed in');
      out('\nFix: run `npx paper-mcp login`.');
      process.exitCode = 1;
    } else {
      out(`handlers       ✗ ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  } finally {
    await host.close();
  }

  // Optional: is the desktop app also up? (only relevant for `relay`).
  try {
    const res = await fetch(`http://${DESKTOP_MCP.host}:${DESKTOP_MCP.port}${DESKTOP_MCP.configPath}`, {
      signal: AbortSignal.timeout(2000),
    });
    out(`desktop app    ${res.ok ? '✓ running (relay available)' : '• not detected'}`);
  } catch {
    out('desktop app    • not running (fine — mcp mode does not need it)');
  }
}

main().catch((err) => {
  if (err instanceof AuthRequiredError) {
    log.error(err.message);
  } else {
    log.error(err instanceof Error ? err.stack || err.message : String(err));
  }
  process.exitCode = 1;
});
