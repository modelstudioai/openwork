/**
 * Feature assertion: the Settings → Keyboard Shortcuts page has a working search
 * box that filters the shortcut rows by their action label AND their key
 * combination ("keypress search").
 *
 * Drives the real UI: opens Settings from the sidebar, navigates to the
 * Shortcuts sub-page, types into the search box, and asserts that the rendered
 * shortcut list narrows to matches (by label and by key token), shows an empty
 * state for a no-match query, and restores fully when cleared.
 *
 * Backend-independent: the Shortcuts page is a pure renderer view over the
 * action registry, so no session or qwen-code connection is needed.
 */

import type { Assertion } from '../runner';

const SEARCH_INPUT = '[data-testid="shortcuts-search-input"]';
const EMPTY = '[data-testid="shortcuts-search-empty"]';
const ROW = '[data-layout="settings-row"]';

/** Text content (lowercased) of every rendered shortcut row. */
function readRowTextsExpr(): string {
  return `JSON.stringify(Array.from(document.querySelectorAll(${JSON.stringify(
    ROW,
  )})).map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase()))`;
}

/** Set a controlled input's value the way React expects, then fire `input`. */
function setInputExpr(value: string): string {
  return `(() => {
    const input = document.querySelector(${JSON.stringify(SEARCH_INPUT)});
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`;
}

const assertion: Assertion = {
  name: 'keyboard-shortcuts settings page search filters shortcuts',
  async run(app) {
    const { session } = app;

    // App fully mounted.
    await session.waitForFunction(
      '!document.getElementById("_loader") && (document.getElementById("root")?.childElementCount ?? 0) > 0',
      { timeoutMs: 30000, message: 'app did not mount' },
    );

    // Open Settings, then the Shortcuts sub-page (real user path).
    await session.click('[data-testid="nav:settings"]', { timeoutMs: 15000 });
    await session.click('[data-testid="settings-item-shortcuts"]', {
      timeoutMs: 15000,
    });

    // The search box is the feature under test — its presence is the first
    // signal the feature shipped.
    await session.waitForSelector(SEARCH_INPUT, {
      timeoutMs: 15000,
      message: 'shortcuts search input did not render',
    });
    await session.waitForFunction(
      `document.querySelectorAll(${JSON.stringify(ROW)}).length > 1`,
      { timeoutMs: 10000, message: 'shortcut rows did not render' },
    );

    const allTexts: string[] = JSON.parse(
      await session.evaluate<string>(readRowTextsExpr()),
    );
    const total = allTexts.length;
    if (total < 2) throw new Error(`expected multiple shortcut rows, saw ${total}`);

    // --- 1) Filter by an action LABEL --------------------------------------
    // Derive the query from the first row's visible label so the test is
    // locale-independent (labels render in whatever language is active).
    const firstLabel = (
      await session.evaluate<string | null>(
        `(() => { const el = document.querySelector(${JSON.stringify(
          ROW,
        )}); if (!el) return null; const lbl = el.querySelector('div'); return (lbl ? lbl.textContent : el.textContent); })()`,
      )
    )
      ?.replace(/\s+/g, ' ')
      .trim();
    if (!firstLabel) throw new Error('could not read a shortcut row label to search for');
    const labelQuery = firstLabel.toLowerCase();

    if (!(await session.evaluate<boolean>(setInputExpr(firstLabel)))) {
      throw new Error('search input disappeared before typing');
    }
    const expectedLabelMatches = allTexts.filter((t) => t.includes(labelQuery)).length;
    await session.waitForFunction(
      `document.querySelectorAll(${JSON.stringify(ROW)}).length === ${expectedLabelMatches}`,
      {
        timeoutMs: 8000,
        message: `label filter did not narrow to the ${expectedLabelMatches} predicted match(es)`,
      },
    );
    const labelVisible: string[] = JSON.parse(
      await session.evaluate<string>(readRowTextsExpr()),
    );
    if (labelVisible.length === 0) {
      throw new Error('label query matched nothing — expected at least its own row');
    }
    if (labelVisible.length >= total) {
      throw new Error(`label filtering did not reduce the list (${labelVisible.length} of ${total})`);
    }
    for (const t of labelVisible) {
      if (!t.includes(labelQuery)) {
        throw new Error(`visible row "${t}" does not contain label query "${labelQuery}"`);
      }
    }

    // --- 2) Filter by a KEY token ("keypress search") ----------------------
    // Read a <kbd> chip from the (now cleared) full list and search for it.
    await session.evaluate(setInputExpr(''));
    await session.waitForFunction(
      `document.querySelectorAll(${JSON.stringify(ROW)}).length === ${total}`,
      { timeoutMs: 8000, message: 'clearing the label query did not restore all rows' },
    );
    const keyToken = (
      await session.evaluate<string | null>(
        `(() => { const k = document.querySelector(${JSON.stringify(
          ROW,
        )} + ' kbd'); return k ? (k.textContent || '').trim() : null; })()`,
      )
    )?.trim();
    if (keyToken && keyToken.length > 0) {
      const keyQuery = keyToken.toLowerCase();
      await session.evaluate(setInputExpr(keyToken));
      const expectedKeyMatches = allTexts.filter((t) => t.includes(keyQuery)).length;
      await session.waitForFunction(
        `document.querySelectorAll(${JSON.stringify(ROW)}).length === ${expectedKeyMatches}`,
        {
          timeoutMs: 8000,
          message: `key filter for "${keyToken}" did not narrow to the ${expectedKeyMatches} predicted match(es)`,
        },
      );
      const keyVisible: string[] = JSON.parse(
        await session.evaluate<string>(readRowTextsExpr()),
      );
      if (keyVisible.length === 0) {
        throw new Error(`key query "${keyToken}" matched nothing — expected at least one row`);
      }
      for (const t of keyVisible) {
        if (!t.includes(keyQuery)) {
          throw new Error(`visible row "${t}" does not contain key query "${keyQuery}"`);
        }
      }
    }

    // --- 3) No-match query shows the empty state and hides every row -------
    await session.evaluate(setInputExpr('zzqqxxnomatchzzqqxx'));
    await session.waitForSelector(EMPTY, {
      timeoutMs: 8000,
      message: 'empty state did not show for a no-match query',
    });
    const noneLeft = await session.evaluate<number>(
      `document.querySelectorAll(${JSON.stringify(ROW)}).length`,
    );
    if (noneLeft !== 0) throw new Error(`expected 0 rows for a no-match query, saw ${noneLeft}`);

    // --- 4) Clearing restores the full list --------------------------------
    await session.evaluate(setInputExpr(''));
    await session.waitForFunction(
      `document.querySelectorAll(${JSON.stringify(ROW)}).length === ${total}`,
      { timeoutMs: 8000, message: 'clearing the query did not restore all rows' },
    );
  },
};

export default assertion;
