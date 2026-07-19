/**
 * Feature assertion: composer prompt-history recall (Up / Down arrows).
 *
 * Drives the real built app over CDP entirely in the draft (no-session) state —
 * no seeded conversation and no backend connection needed. The composer reads
 * its history fresh from localStorage, so the assertion seeds three prior
 * prompts there and then walks them with the keyboard:
 *
 *   1. Composer renders and is empty; no history recalled yet.
 *   2. Seed localStorage['craft-prompt-history'] = [alpha, beta, gamma].
 *   3. ArrowUp recalls the newest (gamma); further Ups walk older (beta, alpha)
 *      and clamp at the oldest.
 *   4. ArrowDown walks newer again (beta, gamma) and, once past the newest,
 *      restores the original (empty) draft.
 *
 * Reading the composer's actual text after each keypress proves the arrows
 * really *change the composer contents*, not merely toggle state.
 */

import type { Assertion } from '../runner';

/** The first visible composer contenteditable (there may be several mounted). */
const COMPOSER_EL = `[...document.querySelectorAll('[data-testid="composer-input"]')].find((el) => el.offsetParent !== null)`;

/** Current trimmed text of the composer (null if it isn't mounted). */
const COMPOSER_TEXT_EXPR = `(() => { const el = ${COMPOSER_EL}; return el ? (el.textContent || '').trim() : null; })()`;

/** Dispatch a real keydown on the composer so its React onKeyDown handler runs. */
function pressKeyExpr(key: string): string {
  return `(() => {
    const el = ${COMPOSER_EL};
    if (!el) return false;
    el.focus();
    el.dispatchEvent(new KeyboardEvent('keydown', {
      key: ${JSON.stringify(key)}, code: ${JSON.stringify(key)}, bubbles: true, cancelable: true,
    }));
    return true;
  })()`;
}

const SEED = ['alpha one', 'beta two', 'gamma three'];

const assertion: Assertion = {
  name: 'composer Up/Down arrows recall previously-sent prompts',
  async run(app) {
    const { session } = app;

    // App fully mounted.
    await session.waitForFunction(
      '!document.getElementById("_loader") && (document.getElementById("root")?.childElementCount ?? 0) > 0',
      { timeoutMs: 30000, message: 'React UI did not mount' },
    );

    // Reach the ready AppShell (not onboarding / workspace picker) — the same
    // stable, non-localized anchor the other composer assertions wait on.
    await session.waitForSelector('[aria-label="Craft menu"]', {
      timeoutMs: 30000,
      message: 'app did not reach the ready AppShell state',
    });

    // 1. The composer renders and starts empty.
    await session.waitForSelector('[data-testid="composer-input"]', {
      timeoutMs: 20000,
      message: 'composer input did not render',
    });
    await session.waitForFunction(`${COMPOSER_TEXT_EXPR} === ''`, {
      timeoutMs: 5000,
      message: 'composer did not start empty',
    });

    // 2. Seed prompt history in localStorage (the composer reads it fresh on Up).
    const seeded = await session.evaluate<boolean>(`(() => {
      localStorage.setItem('craft-prompt-history', ${JSON.stringify(JSON.stringify(SEED))});
      return true;
    })()`);
    if (!seeded) throw new Error('failed to seed prompt history in localStorage');

    // Helper: press a key, then wait for the composer to show the expected text.
    const pressExpect = async (key: string, expected: string, note: string) => {
      if (!(await session.evaluate<boolean>(pressKeyExpr(key)))) {
        throw new Error(`failed to dispatch ${key} on the composer`);
      }
      await session.waitForFunction(`${COMPOSER_TEXT_EXPR} === ${JSON.stringify(expected)}`, {
        timeoutMs: 5000,
        message: `${note}: expected composer text ${JSON.stringify(expected)} after ${key}`,
      });
    };

    // 3. ArrowUp walks backwards through history (newest → oldest), clamping.
    await pressExpect('ArrowUp', 'gamma three', 'first Up recalls newest');
    await pressExpect('ArrowUp', 'beta two', 'second Up recalls older');
    await pressExpect('ArrowUp', 'alpha one', 'third Up recalls oldest');
    await pressExpect('ArrowUp', 'alpha one', 'Up clamps at the oldest entry');

    // 4. ArrowDown walks forward again, then restores the original empty draft.
    await pressExpect('ArrowDown', 'beta two', 'Down steps newer');
    await pressExpect('ArrowDown', 'gamma three', 'Down steps to newest');
    await pressExpect('ArrowDown', '', 'Down past newest restores the draft');
  },
};

export default assertion;
