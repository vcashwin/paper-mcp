import { chromium } from 'playwright';
import { createInterface } from 'node:readline';
import { resolveEnv } from '../config.js';
import { profileDir } from './session.js';
import { log } from '../log.js';

/**
 * Interactive sign-in. Opens a real (headed) browser at app.paper.design where
 * you complete Paper's normal WorkOS AuthKit OAuth flow — the exact same sign-in
 * the desktop app triggers, including SSO / password managers. The resulting
 * session cookies persist in the profile directory, so later headless `mcp` runs
 * are already authenticated.
 *
 * @param {{ env?: string, profile?: string }} [options]
 */
export async function login(options = {}) {
  const env = resolveEnv(options.env);
  const dir = profileDir(env.key, options.profile);

  log.info(`Opening a browser to sign in to Paper (${env.key}). Profile: ${dir}`);
  process.stderr.write(
    `\nA browser window will open at ${env.app}.\n` +
      `Sign in to Paper as you normally would, then come back here.\n\n`
  );

  const context = await chromium.launchPersistentContext(dir, {
    headless: false,
    viewport: { width: 1280, height: 860 },
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`${env.app}/`, { waitUntil: 'domcontentloaded' }).catch((err) => {
    log.warn('Initial navigation failed (you can still sign in):', err);
  });

  const signedIn = await waitForSignIn(page, env.app);

  if (signedIn) {
    process.stderr.write('\n✓ Signed in. Session saved — you can close the browser.\n');
  } else {
    process.stderr.write('\nSaved whatever session exists. If `paper-mcp doctor` says you are not signed in, run login again.\n');
  }

  // Give the browser a moment to flush cookies to disk, then close.
  await page.waitForTimeout(500).catch(() => {});
  await context.close().catch(() => {});
  return signedIn;
}

/**
 * Resolve when the app looks authenticated (on an app.paper.design page that is
 * not the auth screen) OR when the user presses Enter in the terminal.
 * @param {import('playwright').Page} page
 * @param {string} appOrigin
 */
async function waitForSignIn(page, appOrigin) {
  const appHost = new URL(appOrigin).hostname;

  const byEnter = new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question('Press Enter once Paper has loaded and you are signed in… ', () => {
      rl.close();
      resolve('enter');
    });
  });

  const byUrl = (async () => {
    const deadline = Date.now() + 5 * 60_000;
    while (Date.now() < deadline) {
      if (page.isClosed()) return 'closed';
      try {
        const url = new URL(page.url());
        const onApp = url.hostname === appHost;
        const onAuth = url.pathname.startsWith('/auth/');
        if (onApp && !onAuth) {
          // Confirm the editor shell actually bootstrapped.
          const ready = await page.evaluate(() => typeof window.resolveMCPHandlers !== 'undefined').catch(() => false);
          if (ready) return 'url';
        }
      } catch {
        /* about:blank etc. */
      }
      await page.waitForTimeout(1000).catch(() => {});
    }
    return 'timeout';
  })();

  const reason = await Promise.race([byEnter, byUrl]);
  log.debug(`Sign-in detected via: ${reason}`);
  return reason === 'url' || reason === 'enter';
}
