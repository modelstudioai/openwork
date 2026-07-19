/**
 * Feature assertion: the composer's expand / collapse (maximize) toggle.
 *
 * Drives the real built app over CDP through the full path:
 *   composer renders an expand toggle (aria-pressed=false, showing the maximize
 *   icon) → click it → the input area grows to a large maximized height and the
 *   toggle flips to aria-pressed=true (minimize icon) → click it again → the
 *   input collapses back to roughly its original compact height and the toggle
 *   returns to aria-pressed=false.
 *
 * The height measurements prove the toggle actually *resizes* the composer, not
 * merely swaps an icon. It runs entirely in the draft (no-session) state, so it
 * needs no seeded conversation.
 */

import type { Assertion } from '../runner';

const TOGGLE = '[data-testid="composer-expand-toggle"]';
const INPUT = '[data-tutorial="chat-input"]';

/** Measured pixel height of the composer's editable input area. */
const INPUT_HEIGHT_EXPR = `(() => {
  const el = document.querySelector(${JSON.stringify(INPUT)});
  return el ? Math.round(el.getBoundingClientRect().height) : -1;
})()`;

/** Current pressed state of the toggle as a string ("true" / "false" / null). */
const PRESSED_EXPR = `(() => {
  const el = document.querySelector(${JSON.stringify(TOGGLE)});
  return el ? el.getAttribute('aria-pressed') : null;
})()`;

const assertion: Assertion = {
  name: 'composer expand toggle maximizes and collapses the input',
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

    // 1. The composer renders the expand toggle, initially not pressed.
    await session.waitForSelector(TOGGLE, {
      timeoutMs: 20000,
      message: 'composer expand toggle did not render in the composer',
    });
    await session.waitForSelector(INPUT, {
      timeoutMs: 20000,
      message: 'composer input area did not render',
    });

    const initialPressed = await session.evaluate<string | null>(PRESSED_EXPR);
    if (initialPressed !== 'false') {
      throw new Error(
        `expected the expand toggle to start un-pressed, saw aria-pressed="${initialPressed}"`,
      );
    }

    const collapsedHeight = await session.evaluate<number>(INPUT_HEIGHT_EXPR);
    if (collapsedHeight <= 0) {
      throw new Error(`could not measure the collapsed input height (got ${collapsedHeight})`);
    }

    // 2. Click to maximize — the input grows substantially and the toggle presses.
    await session.click(TOGGLE, {
      timeoutMs: 5000,
      message: 'failed to click the expand toggle',
    });

    // A real maximize floors at ~560px; require a clear, unambiguous growth.
    const expandedTarget = Math.max(collapsedHeight * 2, 400);
    await session.waitForFunction(
      `${INPUT_HEIGHT_EXPR} >= ${expandedTarget}`,
      {
        timeoutMs: 6000,
        message: `input did not grow to the maximized height (expected >= ${expandedTarget}px from ${collapsedHeight}px)`,
      },
    );
    await session.waitForFunction(`${PRESSED_EXPR} === "true"`, {
      timeoutMs: 4000,
      message: 'expand toggle did not flip to aria-pressed="true" after maximizing',
    });

    const expandedHeight = await session.evaluate<number>(INPUT_HEIGHT_EXPR);

    // 3. Click again to collapse — the input returns to roughly its start height
    //    and the toggle un-presses.
    await session.click(TOGGLE, {
      timeoutMs: 5000,
      message: 'failed to click the collapse toggle',
    });

    // Collapsed again means well below the expanded height (allow layout slack).
    const collapsedCeiling = Math.max(collapsedHeight + 40, Math.round(expandedHeight / 2));
    await session.waitForFunction(
      `${INPUT_HEIGHT_EXPR} <= ${collapsedCeiling}`,
      {
        timeoutMs: 6000,
        message: `input did not collapse back (expected <= ${collapsedCeiling}px from ${expandedHeight}px)`,
      },
    );
    await session.waitForFunction(`${PRESSED_EXPR} === "false"`, {
      timeoutMs: 4000,
      message: 'expand toggle did not return to aria-pressed="false" after collapsing',
    });
  },
};

export default assertion;
