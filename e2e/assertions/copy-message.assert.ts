/**
 * Feature assertion: the "Copy" (copy-as-Markdown) action on assistant/agent
 * responses.
 *
 * Drives the real built app over CDP through the full path:
 *   seed a 1-user + 1-assistant session on disk → open it → the assistant bubble
 *   renders → its copy button is present and reports the un-copied state → click
 *   it → the exact response Markdown is written to the clipboard AND the button
 *   flips to its "copied" state.
 *
 * The clipboard-content check proves the button copies the real response text
 * (not merely that it renders or toggles an icon). `navigator.clipboard.writeText`
 * is stubbed in-page before the click so the assertion is deterministic on a
 * headless host where the OS clipboard/permission may be unavailable.
 *
 * A backend is NOT required: the session is pre-seeded as a plain `session.jsonl`
 * under the isolated profile's default-workspace root before the app boots, so
 * the transcript is real and local without invoking qwen-code.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Assertion } from '../runner';
import type { ProfileDirs } from '../app';

const SESSION_ID = 'e2e-copy-seeded';
const SESSION_NAME = 'Copy seed';

/** The exact response text the copy button must place on the clipboard. */
const ASSISTANT_CONTENT =
  '# Heading\n\nHere is the **assistant** response with a list:\n\n' +
  '- one\n- two\n\n```ts\nconst x = 1\n```\n';

const ROW = `[data-session-id="${SESSION_ID}"]`;
const COPY_BTN = '[data-testid="assistant-copy"]';

/**
 * Pre-seed a session with a user prompt and an assistant response so the
 * transcript renders an assistant bubble (which owns the copy button). Written
 * before Electron launches; the app lists and loads it on boot.
 */
function seed({ workspaceDir }: ProfileDirs): void {
  const sessionDir = join(workspaceDir, 'sessions', SESSION_ID);
  mkdirSync(sessionDir, { recursive: true });

  const base = 1700000000000;
  const header = {
    id: SESSION_ID,
    workspaceRootPath: workspaceDir,
    name: SESSION_NAME,
    createdAt: base,
    lastUsedAt: base + 2,
    lastMessageAt: base + 2,
    sessionStatus: 'todo',
    messageCount: 2,
    lastMessageRole: 'assistant',
    preview: 'Seeded conversation for copy-message testing',
  };

  const lines = [
    JSON.stringify(header),
    JSON.stringify({ id: 'm1', type: 'user', content: 'Please answer.', timestamp: base + 1 }),
    JSON.stringify({ id: 'm2', type: 'assistant', content: ASSISTANT_CONTENT, timestamp: base + 2, turnId: 't2' }),
  ];
  writeFileSync(join(sessionDir, 'session.jsonl'), lines.join('\n') + '\n', 'utf-8');
}

const assertion: Assertion = {
  name: 'assistant message copy button copies the response markdown to the clipboard',
  seed,
  async run(app) {
    const { session } = app;

    // App fully mounted and at the ready AppShell (same anchors other assertions use).
    await session.waitForFunction(
      '!document.getElementById("_loader") && (document.getElementById("root")?.childElementCount ?? 0) > 0',
      { timeoutMs: 30000, message: 'React UI did not mount' },
    );
    await session.waitForSelector('[aria-label="Craft menu"]', {
      timeoutMs: 30000,
      message: 'app did not reach the ready AppShell state',
    });

    // 1. The seeded session appears in the sidebar list.
    await session.waitForSelector(ROW, {
      timeoutMs: 20000,
      message: 'seeded session row did not appear in the session list',
    });

    // 2. Open it. The row selects on `mousedown` (not click), so dispatch a real
    //    left-button press + release on the row's button.
    const opened = await session.evaluate<boolean>(`(() => {
      const btn = document.querySelector(${JSON.stringify(ROW)} + ' button.entity-row-btn')
        || document.querySelector(${JSON.stringify(ROW)} + ' button')
        || document.querySelector(${JSON.stringify(ROW)});
      if (!btn) return false;
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
      return true;
    })()`);
    if (!opened) throw new Error('could not find/press the seeded session row');

    // 3. The assistant bubble's copy button renders (proof the seeded response
    //    loaded, not the empty/draft state).
    await session.waitForSelector(COPY_BTN, {
      timeoutMs: 20000,
      message: 'assistant copy button did not render for the seeded response',
    });

    // 4. It starts in the un-copied state.
    const initialCopied = await session.evaluate<string | null>(
      `document.querySelector(${JSON.stringify(COPY_BTN)})?.getAttribute('data-copied') ?? null`,
    );
    if (initialCopied !== 'false') {
      throw new Error(`copy button should start un-copied, saw data-copied=${JSON.stringify(initialCopied)}`);
    }

    // 5. Stub clipboard.writeText so we can capture the copied text deterministically
    //    on a headless host, then click the button.
    await session.evaluate(`(() => {
      window.__copiedText = undefined;
      try {
        navigator.clipboard.writeText = (text) => { window.__copiedText = String(text); return Promise.resolve(); };
      } catch {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: (text) => { window.__copiedText = String(text); return Promise.resolve(); } },
        });
      }
      return true;
    })()`);

    const clicked = await session.evaluate<boolean>(`(() => {
      const el = document.querySelector(${JSON.stringify(COPY_BTN)});
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!clicked) throw new Error('could not click the assistant copy button');

    // 6. The exact response markdown was placed on the clipboard.
    await session.waitForFunction('window.__copiedText !== undefined', {
      timeoutMs: 5000,
      message: 'clipboard.writeText was never called by the copy button',
    });
    const copiedText = await session.evaluate<string | null>('window.__copiedText ?? null');
    if (copiedText !== ASSISTANT_CONTENT) {
      throw new Error(
        `copy button wrote the wrong text to the clipboard.\n  expected: ${JSON.stringify(ASSISTANT_CONTENT)}\n  actual:   ${JSON.stringify(copiedText)}`,
      );
    }

    // 7. The button reflects the copied state (proves it's a real, wired action).
    await session.waitForFunction(
      `document.querySelector(${JSON.stringify(COPY_BTN)})?.getAttribute('data-copied') === 'true'`,
      { timeoutMs: 5000, message: 'copy button did not enter its "copied" state after clicking' },
    );
  },
};

export default assertion;
