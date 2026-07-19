/**
 * Feature assertion: starter prompt suggestions on the empty conversation state.
 *
 * Drives the real built app over CDP through the full path:
 *   boot into the empty draft chat → the suggestion chips render → click one →
 *   the composer is populated with that suggestion's (fuller) prompt → the
 *   suggestions surface disappears once the composer has content.
 *
 * This proves the feature actually *does* something (seeds the composer), not
 * merely that the chips render.
 */

import type { Assertion } from '../runner';

const SUGGESTIONS = '[data-testid="empty-suggestions"]';
const CHIP = '[data-testid="empty-suggestion"]';
const COMPOSER = '[role="textbox"][aria-multiline="true"]';

/** Visible chips only (defensive against hidden/duplicated nodes). */
const VISIBLE_CHIPS_EXPR = `[...document.querySelectorAll(${JSON.stringify(
  CHIP,
)})].filter((el) => el.offsetParent !== null)`;

/** Trimmed text of the (visible) composer, with zero-width chars stripped. */
const COMPOSER_TEXT_EXPR = `(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(
    COMPOSER,
  )})].find((n) => n.offsetParent !== null);
  if (!el) return null;
  return (el.textContent || '').replace(/[\\u200B-\\u200D\\uFEFF]/g, '').trim();
})()`;

const assertion: Assertion = {
  name: 'empty-state starter suggestions seed the composer',
  async run(app) {
    const { session } = app;

    // App fully mounted.
    await session.waitForFunction(
      '!document.getElementById("_loader") && (document.getElementById("root")?.childElementCount ?? 0) > 0',
      { timeoutMs: 30000, message: 'React UI did not mount' },
    );

    // Reach the ready AppShell (not onboarding / workspace-picker). The empty
    // draft chat — with its centered composer — is the default landing view.
    await session.waitForSelector('[aria-label="Craft menu"]', {
      timeoutMs: 30000,
      message: 'app did not reach the ready AppShell state',
    });

    // 1. The suggestions surface renders on the empty conversation.
    await session.waitForSelector(SUGGESTIONS, {
      timeoutMs: 15000,
      message: 'starter suggestions did not render on the empty conversation',
    });

    // 2. It shows the full set of chips (4).
    await session.waitForFunction(`${VISIBLE_CHIPS_EXPR}.length === 4`, {
      timeoutMs: 8000,
      message: 'expected 4 visible starter-suggestion chips',
    });

    // 3. The composer starts empty.
    const before = await session.evaluate<string | null>(COMPOSER_TEXT_EXPR);
    if (before == null) throw new Error('could not locate the composer text box');
    if (before.length !== 0) {
      throw new Error(`composer was not empty at start (saw: ${JSON.stringify(before)})`);
    }

    // 4. Capture the first chip's visible label, then click it.
    const label = await session.evaluate<string | null>(
      `(() => { const el = ${VISIBLE_CHIPS_EXPR}[0]; return el ? (el.textContent || '').trim() : null; })()`,
    );
    if (!label) throw new Error('could not read the first suggestion label');

    const clicked = await session.evaluate<boolean>(
      `(() => { const el = ${VISIBLE_CHIPS_EXPR}[0]; if (!el) return false; el.click(); return true; })()`,
    );
    if (!clicked) throw new Error('failed to click the first suggestion chip');

    // 5. The composer is populated with the suggestion's prompt. The prompt is a
    //    full sentence, so it must be non-empty and longer than the short label —
    //    proving it seeded the *prompt*, not merely echoed the chip title.
    await session.waitForFunction(
      `(() => {
        const text = ${COMPOSER_TEXT_EXPR};
        return typeof text === 'string' && text.length > ${label.length} && text.length > 20;
      })()`,
      {
        timeoutMs: 8000,
        message: 'clicking a suggestion did not populate the composer with its prompt',
      },
    );

    // 6. Once the composer has content, the suggestions surface goes away
    //    (matching the empty-state-only behavior of the feature).
    await session.waitForFunction(
      `!document.querySelector(${JSON.stringify(SUGGESTIONS)})`,
      {
        timeoutMs: 8000,
        message: 'suggestions did not hide after the composer was populated',
      },
    );
  },
};

export default assertion;
