/**
 * Feature assertion: the keyboard shortcut that opens the composer's thinking
 * (reasoning effort) menu.
 *
 * Mirrors Claude Code Desktop's effort-menu shortcut (⌘⇧E). Drives the real
 * built app over CDP:
 *   composer renders a thinking-level trigger with its menu CLOSED → dispatch
 *   the Cmd/Ctrl+Shift+E keydown at the window level → the thinking menu OPENS
 *   (lists all six levels).
 *
 * Asserting the menu is closed *before* the keypress and open *after* it proves
 * the shortcut actually opens the menu — not merely that the menu can render.
 */

import type { Assertion } from '../runner';

const TRIGGER = '[data-testid="thinking-level-trigger"]';
const ITEM = '[data-testid="thinking-level-item"]';

/** The six thinking levels are the single source of truth for the count. */
const EXPECTED_LEVEL_COUNT = 6;

/** Menu items that are actually visible (Radix renders them in a portal). */
const VISIBLE_ITEMS_EXPR = `[...document.querySelectorAll(${JSON.stringify(
  ITEM,
)})].filter((el) => el.offsetParent !== null)`;

/**
 * Dispatch the effort-menu shortcut at the window level, where the action
 * registry's capture-phase keydown listener lives. `mod` resolves to Cmd on
 * macOS and Ctrl elsewhere; set both `metaKey` and `ctrlKey` so the same event
 * matches on either platform (the registry only checks the platform's mod key).
 */
const PRESS_SHORTCUT_EXPR = `(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'e',
    code: 'KeyE',
    ctrlKey: true,
    metaKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  }));
  return true;
})()`;

const assertion: Assertion = {
  name: 'Cmd/Ctrl+Shift+E opens the composer thinking-level menu',
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

    // The composer renders a thinking-level trigger.
    await session.waitForSelector(TRIGGER, {
      timeoutMs: 20000,
      message: 'thinking-level picker trigger did not render in the composer',
    });

    // Precondition: the menu is closed (no visible items).
    if ((await session.evaluate<number>(`${VISIBLE_ITEMS_EXPR}.length`)) !== 0) {
      throw new Error('thinking-level menu was already open before pressing the shortcut');
    }

    // Press the shortcut at the window level.
    if (!(await session.evaluate<boolean>(PRESS_SHORTCUT_EXPR))) {
      throw new Error('failed to dispatch the Cmd/Ctrl+Shift+E keydown');
    }

    // The menu opens and lists all six thinking levels — proving the shortcut
    // opened it.
    await session.waitForFunction(
      `${VISIBLE_ITEMS_EXPR}.length === ${EXPECTED_LEVEL_COUNT}`,
      {
        timeoutMs: 8000,
        message: `thinking-level menu did not open (expected ${EXPECTED_LEVEL_COUNT} levels) after pressing Cmd/Ctrl+Shift+E`,
      },
    );
  },
};

export default assertion;
