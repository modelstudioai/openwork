/**
 * Launches the built OpenWork Electron app with the Chrome DevTools Protocol
 * enabled, waits for the main renderer window, and hands back a connected
 * {@link CdpSession}. Also owns clean teardown.
 *
 * The app runs against an isolated user-data dir so end-to-end runs never touch
 * the developer's real OpenWork profile.
 */

import { spawn, type Subprocess } from 'bun';
import net from 'node:net';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CdpSession, isEndpointReady, listTargets, type CdpTarget } from './cdp';

const ROOT_DIR = join(import.meta.dir, '..');
const ELECTRON_DIR = join(ROOT_DIR, 'apps/electron');
const IS_WINDOWS = process.platform === 'win32';
const ELECTRON_BIN = join(ROOT_DIR, `node_modules/.bin/electron${IS_WINDOWS ? '.cmd' : ''}`);
const E2E_DIR = join(ROOT_DIR, '.e2e');

const MAIN_BUNDLE = join(ELECTRON_DIR, 'dist/main.cjs');
const RENDERER_HTML = join(ELECTRON_DIR, 'dist/renderer/index.html');

export interface LaunchOptions {
  /** Override the remote-debugging port (default: an ephemeral free port). */
  port?: number;
  /** Force a rebuild of the Electron bundles before launching. */
  rebuild?: boolean;
  /** Milliseconds to wait for the main renderer target to appear. */
  startupTimeoutMs?: number;
}

export interface LaunchedApp {
  session: CdpSession;
  target: CdpTarget;
  port: number;
  stop(): Promise<void>;
}

/** Find a free TCP port on the loopback interface. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      if (address && typeof address === 'object') {
        const { port } = address;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('could not determine a free port')));
      }
    });
  });
}

/** Ensure the Electron main + renderer bundles exist, building them if needed. */
async function ensureBuilt(rebuild: boolean): Promise<void> {
  const built = existsSync(MAIN_BUNDLE) && existsSync(RENDERER_HTML);
  if (built && !rebuild) return;

  console.log(rebuild ? '🔨 Rebuilding Electron bundles (rebuild requested)...' : '🔨 Electron bundles missing — building...');
  const proc = spawn({
    cmd: ['bun', 'run', 'electron:build'],
    cwd: ROOT_DIR,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`electron:build failed with exit code ${exitCode}`);
  }
  if (!existsSync(MAIN_BUNDLE) || !existsSync(RENDERER_HTML)) {
    throw new Error('Build completed but expected bundles are still missing');
  }
}

/** Distinguish the primary app window from pet/toolbar/devtools targets. */
function isMainRenderer(target: CdpTarget): boolean {
  if (target.type !== 'page') return false;
  const url = target.url ?? '';
  const title = target.title ?? '';
  if (
    url.startsWith('devtools://') ||
    url.includes('pet.html') ||
    url.includes('browser-toolbar') ||
    url.includes('browser-empty-state')
  ) {
    return false;
  }
  return title.includes('Qwen Code Desktop') || url.includes('/renderer/index.html');
}

async function waitForMainTarget(port: number, deadline: number): Promise<CdpTarget> {
  while (Date.now() < deadline) {
    if (await isEndpointReady(port)) {
      try {
        const target = (await listTargets(port)).find(isMainRenderer);
        if (target?.webSocketDebuggerUrl) return target;
      } catch {
        // endpoint may briefly 404 between page loads — keep polling
      }
    }
    await Bun.sleep(250);
  }
  throw new Error(`main renderer target did not appear within timeout on port ${port}`);
}

export async function launchApp(options: LaunchOptions = {}): Promise<LaunchedApp> {
  await ensureBuilt(options.rebuild ?? process.env.E2E_BUILD === '1');

  let port = options.port;
  if (!port && process.env.E2E_PORT) port = Number(process.env.E2E_PORT);
  if (!port) port = await getFreePort();
  const startupTimeoutMs = options.startupTimeoutMs ?? 45000;

  // Isolated profile so e2e runs never clobber the real OpenWork data:
  //  - CRAFT_USER_DATA_DIR  → Electron userData (cache, cookies, local storage)
  //  - CRAFT_CONFIG_DIR     → app config + project-workspace registry (~/.craft-agent)
  //  - QWEN_DEFAULT_WORKSPACE_DIR → the default conversation workspace (else ~/Documents)
  //
  // Keyed on the (unique-per-launch) debug port so each assertion gets its own
  // profile. Electron's single-instance lock lives in userData; if a prior
  // instance lingers a moment past teardown, a shared profile would make the
  // next launch hand off to the old instance and exit — and no new renderer
  // target would ever appear.
  const profileKey = `p${port}`;
  const userDataDir = join(E2E_DIR, 'user-data', profileKey);
  const configDir = join(E2E_DIR, 'config', profileKey);
  const workspaceDir = join(E2E_DIR, 'workspace', profileKey);
  mkdirSync(userDataDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });
  mkdirSync(workspaceDir, { recursive: true });

  const electronArgs = [
    'apps/electron',
    `--remote-debugging-port=${port}`,
    // Modern Chromium rejects CDP WebSocket upgrades from disallowed origins.
    '--remote-allow-origins=*',
  ];

  // On a headless Linux host (CI / cloud routine) there is no X display, so run
  // Electron under a virtual framebuffer and disable the Chromium sandbox, which
  // cannot initialize as root inside a container.
  const headlessLinux = process.platform === 'linux' && !process.env.DISPLAY;
  const baseCmd = headlessLinux
    ? ['xvfb-run', '-a', ELECTRON_BIN, ...electronArgs, '--no-sandbox']
    : [ELECTRON_BIN, ...electronArgs];
  // Under headless Linux, launch in a fresh process group (via setsid) so
  // teardown can signal the whole tree. `xvfb-run` forks Xvfb and Electron as
  // separate children; a plain kill() of the wrapper orphans them, leaking the
  // Electron instance (and its single-instance lock) into the next assertion.
  // Other platforms launch Electron directly, so the wrapper problem — and the
  // need for `setsid`, which isn't present on macOS — does not apply.
  const useProcessGroup = headlessLinux;
  const cmd = useProcessGroup ? ['setsid', ...baseCmd] : baseCmd;

  const proc: Subprocess = spawn({
    cmd,
    cwd: ROOT_DIR,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...(process.env as Record<string, string>),
      CRAFT_USER_DATA_DIR: userDataDir,
      CRAFT_CONFIG_DIR: configDir,
      QWEN_DEFAULT_WORKSPACE_DIR: workspaceDir,
      CRAFT_APP_NAME: 'OpenWork E2E',
    },
  });

  let stopped = false;
  // Signal the whole process group when we launched via setsid, so Xvfb and
  // Electron die with the wrapper instead of being orphaned.
  const signalTree = (signal: number): void => {
    if (useProcessGroup && typeof proc.pid === 'number') {
      try {
        process.kill(-proc.pid, signal);
        return;
      } catch {
        // group already gone — fall through to the single-process kill
      }
    }
    try {
      proc.kill(signal);
    } catch {
      // already gone
    }
  };
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    signalTree(15);
    // Escalate if it doesn't exit promptly.
    const exited = await Promise.race([
      proc.exited.then(() => true),
      Bun.sleep(5000).then(() => false),
    ]);
    if (!exited) {
      signalTree(9);
    }
  };

  try {
    const target = await waitForMainTarget(port, Date.now() + startupTimeoutMs);
    const session = await CdpSession.attach(target);
    return {
      session,
      target,
      port,
      stop: async () => {
        await session.close();
        await stop();
      },
    };
  } catch (err) {
    await stop();
    throw err;
  }
}
