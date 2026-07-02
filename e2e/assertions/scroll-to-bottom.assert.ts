/**
 * Feature assertion: the chat transcript's "jump to latest" (scroll-to-bottom)
 * button.
 *
 * Drives the real built app over CDP through the full path:
 *   seed a 40-message session on disk → open it → transcript renders at the
 *   bottom with the button hidden → scroll up → the floating button appears →
 *   click it → the transcript returns to the bottom and the button disappears.
 *
 * The final steps prove the button actually *scrolls* the transcript back to
 * the latest message, not merely that it renders.
 *
 * A backend is NOT required: the session is pre-seeded as a plain `session.jsonl`
 * file under the isolated profile's default-workspace root before the app boots,
 * so the transcript is real, local, and scrollable without invoking qwen-code.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Assertion } from '../runner';
import type { ProfileDirs } from '../app';

const SESSION_ID = 'e2e-scroll-seeded';
const SESSION_NAME = 'Scroll seed';
const MESSAGE_COUNT = 40;

const ROW = `[data-session-id="${SESSION_ID}"]`;
const BUTTON = '[data-testid="scroll-to-bottom"]';

/** The scrollable transcript viewport (Radix ScrollArea viewport inside our tagged region). */
const VIEWPORT = `document.querySelector('[data-testid="chat-transcript"] [data-radix-scroll-area-viewport]')`;

/** distanceFromBottom of the transcript viewport, or -1 when it isn't mounted yet. */
const DISTANCE_EXPR = `(() => {
  const v = ${VIEWPORT};
  if (!v) return -1;
  return v.scrollHeight - v.scrollTop - v.clientHeight;
})()`;

/**
 * Pre-seed a session with many messages so the transcript overflows the
 * viewport. Written before Electron launches; the app lists it on boot.
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
    lastUsedAt: base + MESSAGE_COUNT,
    lastMessageAt: base + MESSAGE_COUNT,
    sessionStatus: 'todo',
    messageCount: MESSAGE_COUNT,
    lastMessageRole: 'assistant',
    preview: 'Seeded conversation for scroll-to-bottom testing',
  };

  const lines = [JSON.stringify(header)];
  for (let i = 1; i <= MESSAGE_COUNT; i++) {
    const isUser = i % 2 === 1;
    // Long, multi-paragraph body so 40 messages reliably overflow the viewport.
    const body =
      `${isUser ? 'User' : 'Assistant'} message ${i}.\n\n` +
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(6);
    const msg: Record<string, unknown> = {
      id: `m${i}`,
      type: isUser ? 'user' : 'assistant',
      content: body,
      timestamp: base + i,
    };
    if (!isUser) msg.turnId = `t${i}`;
    lines.push(JSON.stringify(msg));
  }
  writeFileSync(join(sessionDir, 'session.jsonl'), lines.join('\n') + '\n', 'utf-8');
}

const assertion: Assertion = {
  name: 'chat scroll-to-bottom button appears when scrolled up and jumps to latest',
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
    //    left-button pointer press on the row's button.
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

    // 3. The transcript renders and overflows the viewport (proof the seeded
    //    conversation actually loaded, not the empty/draft state).
    await session.waitForFunction(
      `(() => { const v = ${VIEWPORT}; return !!v && v.clientHeight > 0 && v.scrollHeight > v.clientHeight + 200; })()`,
      { timeoutMs: 20000, message: 'seeded transcript did not render as a scrollable viewport' },
    );

    // 4. On open the transcript sticks to the bottom, so the jump button is hidden.
    await session.waitForFunction(`${DISTANCE_EXPR} >= 0 && ${DISTANCE_EXPR} < 40`, {
      timeoutMs: 8000,
      message: 'transcript did not settle at the bottom on open',
    });
    const buttonVisibleAtBottom = await session.evaluate<boolean>(
      `!!document.querySelector(${JSON.stringify(BUTTON)})`,
    );
    if (buttonVisibleAtBottom) {
      throw new Error('scroll-to-bottom button was visible while already at the bottom');
    }

    // 5. Scroll to the top. Setting scrollTop fires a scroll event; also dispatch
    //    one explicitly so the handler recomputes regardless.
    await session.evaluate(`(() => {
      const v = ${VIEWPORT};
      if (!v) return false;
      v.scrollTop = 0;
      v.dispatchEvent(new Event('scroll', { bubbles: true }));
      return true;
    })()`);

    // 6. Now well away from the bottom, the button appears.
    await session.waitForFunction(`${DISTANCE_EXPR} > 200`, {
      timeoutMs: 5000,
      message: 'scrolling to top did not move the viewport away from the bottom',
    });
    await session.waitForSelector(BUTTON, {
      timeoutMs: 5000,
      message: 'scroll-to-bottom button did not appear after scrolling up',
    });

    // 7. Click it — it must scroll the transcript back to the latest message...
    const clicked = await session.evaluate<boolean>(`(() => {
      const btn = document.querySelector(${JSON.stringify(BUTTON)});
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    if (!clicked) throw new Error('could not click the scroll-to-bottom button');

    await session.waitForFunction(`${DISTANCE_EXPR} >= 0 && ${DISTANCE_EXPR} < 40`, {
      timeoutMs: 8000,
      message: 'clicking the button did not return the transcript to the bottom',
    });

    // 8. ...and hide itself again once back at the bottom.
    await session.waitForFunction(`!document.querySelector(${JSON.stringify(BUTTON)})`, {
      timeoutMs: 5000,
      message: 'scroll-to-bottom button did not disappear after returning to the bottom',
    });
  },
};

export default assertion;
