/**
 * Feature assertion: the composer's live word / character count indicator.
 *
 * Drives the real built app over CDP entirely in the draft (no-session) state —
 * no seeded conversation and no backend — through the full path:
 *   empty composer shows no count indicator → typing real text makes it appear
 *   with the correct word/character counts → appending updates the counts live →
 *   clearing the draft hides the indicator again.
 *
 * Asserting the indicator is *absent* while empty and *present with correct
 * counts* after typing (and gone again after clearing) proves it reflects the
 * actual draft content reactively, not merely that a static element renders.
 */

import type { Assertion } from '../runner';

/** The composer's contenteditable carries this stable tutorial hook. */
const EDITOR = '[data-tutorial="chat-input"]';
const COUNT = '[data-testid="composer-count"]';

/** Read a numeric data-* attribute off the count indicator (or null if absent). */
const readCountAttr = (attr: string) =>
  `(() => { const el = document.querySelector(${JSON.stringify(
    COUNT,
  )}); return el ? el.getAttribute(${JSON.stringify(attr)}) : null; })()`;

/** Focus the composer editor and place a collapsed caret at the end of its content. */
const FOCUS_CARET_END_EXPR = `(() => {
  const el = document.querySelector(${JSON.stringify(EDITOR)});
  if (!el) return false;
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
})()`;

/** Select the composer's entire content and delete it (fires a real input event). */
const CLEAR_EDITOR_EXPR = `(() => {
  const el = document.querySelector(${JSON.stringify(EDITOR)});
  if (!el) return false;
  el.focus();
  document.execCommand('selectAll');
  document.execCommand('delete');
  return true;
})()`;

const assertion: Assertion = {
  name: 'composer shows a live word/character count that tracks the draft',
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

    // The composer's contenteditable renders.
    await session.waitForSelector(EDITOR, {
      timeoutMs: 20000,
      message: 'composer editor did not render',
    });

    // 1. While the draft is empty, the count indicator is absent.
    if (await session.evaluate<boolean>(`!!document.querySelector(${JSON.stringify(COUNT)})`)) {
      throw new Error('count indicator was present for an empty composer');
    }

    // 2. Type real text and assert the indicator appears with the right counts.
    if (!(await session.evaluate<boolean>(FOCUS_CARET_END_EXPR))) {
      throw new Error('could not focus the composer editor');
    }
    await session.send('Input.insertText', { text: 'hello world' });

    await session.waitForFunction(`document.querySelector(${JSON.stringify(COUNT)})`, {
      timeoutMs: 8000,
      message: 'count indicator did not appear after typing',
    });

    const words1 = await session.evaluate<string | null>(readCountAttr('data-word-count'));
    const chars1 = await session.evaluate<string | null>(readCountAttr('data-char-count'));
    if (words1 !== '2') {
      throw new Error(`expected 2 words after typing "hello world", saw ${JSON.stringify(words1)}`);
    }
    if (chars1 !== '11') {
      throw new Error(
        `expected 11 characters after typing "hello world", saw ${JSON.stringify(chars1)}`,
      );
    }

    // 3. Appending more text updates the counts live.
    if (!(await session.evaluate<boolean>(FOCUS_CARET_END_EXPR))) {
      throw new Error('could not re-focus the composer editor before appending');
    }
    await session.send('Input.insertText', { text: ' again' });

    await session.waitForFunction(
      `(() => { const el = document.querySelector(${JSON.stringify(
        COUNT,
      )}); return el && el.getAttribute('data-word-count') === '3'; })()`,
      { timeoutMs: 8000, message: 'word count did not update to 3 after appending text' },
    );
    const chars2 = await session.evaluate<string | null>(readCountAttr('data-char-count'));
    if (chars2 !== '17') {
      throw new Error(
        `expected 17 characters after appending " again", saw ${JSON.stringify(chars2)}`,
      );
    }

    // 4. Clearing the draft hides the indicator again.
    if (!(await session.evaluate<boolean>(CLEAR_EDITOR_EXPR))) {
      throw new Error('could not clear the composer editor');
    }
    await session.waitForFunction(
      `!document.querySelector(${JSON.stringify(COUNT)})`,
      { timeoutMs: 8000, message: 'count indicator did not disappear after clearing the draft' },
    );
  },
};

export default assertion;
