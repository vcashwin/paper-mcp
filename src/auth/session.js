import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * Where we keep the signed-in browser profile. Playwright's persistent context
 * stores cookies (including Paper's sealed-session cookie) in this directory, so
 * once you `login` the headless `mcp` runs reuse the same authenticated session —
 * exactly how a browser keeps you logged in between launches.
 *
 * Override with PAPER_MCP_PROFILE. One directory per environment so prod and
 * staging sessions never collide.
 *
 * @param {string} envKey
 * @param {string} [override]
 */
export function profileDir(envKey, override) {
  const base = override || process.env.PAPER_MCP_PROFILE || join(homedir(), '.paper-mcp');
  const dir = join(base, 'profiles', envKey);
  mkdirSync(dir, { recursive: true });
  return dir;
}
