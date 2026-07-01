/**
 * Feature assertion: the global command palette (⌘K / Ctrl+K).
 *
 * Drives the real built app over CDP through the full path:
 *   open via hotkey → list actions → filter → empty state → clear → run an
 *   action and observe its side effect.
 *
 * The final step selects "Toggle Theme" and asserts the app theme actually
 * flips (documentElement `dark` class) and the palette closes — proving the
 * palette *executes* the chosen action, not merely displays it.
 */

import type { Assertion } from '../runner';

const PALETTE = '[data-testid="command-palette"]';
const INPUT = '[data-testid="command-palette-input"]';
const ITEM = '[data-testid="command-palette-item"]';
const EMPTY = '[data-testid="command-palette-empty"]';

/** Count palette rows that are actually visible (cmdk keeps filtered rows in the DOM but hidden). */
const VISIBLE_ITEMS_EXPR = `[...document.querySelectorAll(${JSON.stringify(ITEM)})].filter(el => el.offsetParent !== null)`;

/** Set a controlled input's value the way React/cmdk expect (native setter + input event). */
function setInputExpr(value: string): string {
  return `(() => {
    const input = document.querySelector(${JSON.stringify(INPUT)});
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`;
}

const assertion: Assertion = {
  name: 'command palette opens, filters, and runs an action',
  async run(app) {
    const { session } = app;

    // App must be mounted first.
    await session.waitForFunction(
      '!document.getElementById("_loader") && (document.getElementById("root")?.childElementCount ?? 0) > 0',
      { timeoutMs: 30000, message: 'React UI did not mount' },
    );

    // The command palette only mounts once the app reaches its "ready" AppShell
    // state (not onboarding / workspace-picker). Wait for a stable, non-localized
    // AppShell anchor before driving the hotkey.
    await session.waitForSelector('[aria-label="Craft menu"]', {
      timeoutMs: 30000,
      message: 'app did not reach the ready AppShell state',
    });

    // 1. Open the palette with the real hotkey. Set both ctrl+meta so the
    //    registry's `mod` match works on Linux (ctrl) and macOS (meta) alike.
    const opened = await session.evaluate<boolean>(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'k', code: 'KeyK', ctrlKey: true, metaKey: true, bubbles: true, cancelable: true,
      }));
      return true;
    })()`);
    if (!opened) throw new Error('failed to dispatch command-palette hotkey');

    await session.waitForSelector(PALETTE, {
      timeoutMs: 8000,
      message: 'command palette did not open on Ctrl/Cmd+K',
    });

    // 2. It lists more than one action row, and the known "Toggle Theme" action is present.
    await session.waitForFunction(`${VISIBLE_ITEMS_EXPR}.length > 1`, {
      timeoutMs: 5000,
      message: 'command palette did not render multiple action rows',
    });
    const fullCount = await session.evaluate<number>(`${VISIBLE_ITEMS_EXPR}.length`);
    const hasToggleTheme = await session.evaluate<boolean>(
      `${VISIBLE_ITEMS_EXPR}.some(el => /toggle theme/i.test(el.textContent || ''))`,
    );
    if (!hasToggleTheme) {
      throw new Error('expected a "Toggle Theme" row in the unfiltered palette');
    }

    // 2b. The palette only lists actions that can actually run. Context-scoped
    //     actions whose handler is disabled here (e.g. "Next Search Match", which
    //     needs an active in-conversation search) must NOT appear — clicking them
    //     would be a dead no-op.
    const hasDeadAction = await session.evaluate<boolean>(
      `${VISIBLE_ITEMS_EXPR}.some(el => /next search match/i.test(el.textContent || ''))`,
    );
    if (hasDeadAction) {
      throw new Error('palette listed a non-executable action ("Next Search Match")');
    }

    // 3. Typing "theme" narrows the list: fewer rows, every visible row matches,
    //    and Toggle Theme survives.
    await session.evaluate(setInputExpr('theme'));
    await session.waitForFunction(
      `${VISIBLE_ITEMS_EXPR}.length > 0 && ${VISIBLE_ITEMS_EXPR}.length < ${fullCount}`,
      { timeoutMs: 5000, message: 'typing "theme" did not narrow the palette list' },
    );
    const allMatch = await session.evaluate<boolean>(
      `${VISIBLE_ITEMS_EXPR}.every(el => /theme/i.test(el.textContent || ''))`,
    );
    if (!allMatch) {
      throw new Error('a visible row did not contain the query "theme" after filtering');
    }
    const stillHasToggleTheme = await session.evaluate<boolean>(
      `${VISIBLE_ITEMS_EXPR}.some(el => /toggle theme/i.test(el.textContent || ''))`,
    );
    if (!stillHasToggleTheme) {
      throw new Error('"Toggle Theme" disappeared after filtering by "theme"');
    }

    // 4. A no-match query shows the empty state and hides every row.
    await session.evaluate(setInputExpr('zzqqxxnomatchzzqqxx'));
    await session.waitForFunction(
      `${VISIBLE_ITEMS_EXPR}.length === 0 && !!document.querySelector(${JSON.stringify(EMPTY)}) && document.querySelector(${JSON.stringify(EMPTY)}).offsetParent !== null`,
      { timeoutMs: 5000, message: 'no-match query did not show the empty state with zero rows' },
    );

    // 5. Clearing the query restores the full list.
    await session.evaluate(setInputExpr(''));
    await session.waitForFunction(`${VISIBLE_ITEMS_EXPR}.length === ${fullCount}`, {
      timeoutMs: 5000,
      message: 'clearing the query did not restore the full list',
    });

    // 6. Re-filter to Toggle Theme and run it; assert the theme flips and the palette closes.
    await session.evaluate(setInputExpr('theme'));
    await session.waitForFunction(
      `${VISIBLE_ITEMS_EXPR}.some(el => /toggle theme/i.test(el.textContent || ''))`,
      { timeoutMs: 5000, message: 'Toggle Theme row not available to select' },
    );
    const wasDark = await session.evaluate<boolean>(
      'document.documentElement.classList.contains("dark")',
    );
    const clicked = await session.evaluate<boolean>(`(() => {
      const el = ${VISIBLE_ITEMS_EXPR}.find(el => /toggle theme/i.test(el.textContent || ''));
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!clicked) throw new Error('could not click the Toggle Theme row');

    // Palette closes after selection.
    await session.waitForFunction(`!document.querySelector(${JSON.stringify(PALETTE)})`, {
      timeoutMs: 5000,
      message: 'palette did not close after selecting an action',
    });

    // And the action actually ran: the theme flipped.
    await session.waitForFunction(
      `document.documentElement.classList.contains("dark") === ${!wasDark}`,
      {
        timeoutMs: 5000,
        message: `selecting "Toggle Theme" did not flip the theme (was dark=${wasDark})`,
      },
    );
  },
};

export default assertion;
