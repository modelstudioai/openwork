/**
 * Feature assertion: the composer's thinking-level (reasoning effort) picker.
 *
 * Drives the real built app over CDP through the full path:
 *   composer renders a thinking-level trigger → open it → it lists all six
 *   levels with exactly one marked selected (matching the trigger) → select a
 *   *different* level → the menu closes and the trigger label updates to the
 *   chosen level.
 *
 * The final step proves the picker actually *changes* the session's thinking
 * level (the value round-trips back into the trigger), not merely displays a
 * list.
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

/** Trimmed visible label of the trigger button (icons are SVGs with no text). */
const TRIGGER_LABEL_EXPR = `(() => { const el = document.querySelector(${JSON.stringify(
  TRIGGER,
)}); return el ? (el.textContent || '').trim() : null; })()`;

/**
 * Radix `DropdownMenuTrigger` opens on `pointerdown` (button 0), not on a
 * synthetic `click`, so dispatch a real pointerdown to open the menu.
 */
const OPEN_MENU_EXPR = `(() => {
  const el = document.querySelector(${JSON.stringify(TRIGGER)});
  if (!el) return false;
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
  return true;
})()`;

/** Read each visible item's primary label + whether it is marked selected (has a check SVG). */
const READ_ITEMS_EXPR = `JSON.stringify(${VISIBLE_ITEMS_EXPR}.map((el) => ({
  label: (el.querySelector('.font-medium')?.textContent || '').trim(),
  selected: !!el.querySelector('svg'),
})))`;

interface ItemInfo {
  label: string;
  selected: boolean;
}

const assertion: Assertion = {
  name: 'composer thinking-level picker lists levels and switches the active level',
  async run(app) {
    const { session } = app;

    // App fully mounted.
    await session.waitForFunction(
      '!document.getElementById("_loader") && (document.getElementById("root")?.childElementCount ?? 0) > 0',
      { timeoutMs: 30000, message: 'React UI did not mount' },
    );

    // Reach the ready AppShell (not onboarding / workspace picker) — the same
    // stable, non-localized anchor the command-palette assertion waits on.
    await session.waitForSelector('[aria-label="Craft menu"]', {
      timeoutMs: 30000,
      message: 'app did not reach the ready AppShell state',
    });

    // 1. The composer renders a thinking-level trigger.
    await session.waitForSelector(TRIGGER, {
      timeoutMs: 20000,
      message: 'thinking-level picker trigger did not render in the composer',
    });

    const initialLabel = (await session.evaluate<string | null>(TRIGGER_LABEL_EXPR))?.trim();
    if (!initialLabel) {
      throw new Error('thinking-level trigger rendered without a visible label');
    }

    // 2. Opening it lists all six thinking levels.
    if (!(await session.evaluate<boolean>(OPEN_MENU_EXPR))) {
      throw new Error('failed to dispatch pointerdown on the thinking-level trigger');
    }
    await session.waitForFunction(
      `${VISIBLE_ITEMS_EXPR}.length === ${EXPECTED_LEVEL_COUNT}`,
      {
        timeoutMs: 8000,
        message: `thinking-level menu did not list ${EXPECTED_LEVEL_COUNT} levels`,
      },
    );

    const items = JSON.parse(await session.evaluate<string>(READ_ITEMS_EXPR)) as ItemInfo[];

    // 3. Exactly one level is marked selected, and it matches the trigger.
    const selected = items.filter((it) => it.selected);
    if (selected.length !== 1) {
      throw new Error(
        `expected exactly one selected thinking level, saw ${selected.length}: ${JSON.stringify(items)}`,
      );
    }
    if (selected[0].label !== initialLabel) {
      throw new Error(
        `selected menu item "${selected[0].label}" does not match the trigger label "${initialLabel}"`,
      );
    }

    // 4. Select a *different* level and assert the trigger label updates to it.
    const target = items.find((it) => !it.selected && it.label && it.label !== initialLabel);
    if (!target) {
      throw new Error(`could not find a non-selected level to switch to: ${JSON.stringify(items)}`);
    }

    const clicked = await session.evaluate<boolean>(`(() => {
      const el = ${VISIBLE_ITEMS_EXPR}.find(
        (el) => (el.querySelector('.font-medium')?.textContent || '').trim() === ${JSON.stringify(target.label)},
      );
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!clicked) throw new Error(`could not click the "${target.label}" thinking-level row`);

    // Menu closes after selection.
    await session.waitForFunction(`${VISIBLE_ITEMS_EXPR}.length === 0`, {
      timeoutMs: 5000,
      message: 'thinking-level menu did not close after selecting a level',
    });

    // The choice round-trips: the trigger now shows the newly selected level.
    await session.waitForFunction(
      `${TRIGGER_LABEL_EXPR} === ${JSON.stringify(target.label)}`,
      {
        timeoutMs: 5000,
        message: `trigger label did not update to "${target.label}" after selection (was "${initialLabel}")`,
      },
    );
  },
};

export default assertion;
