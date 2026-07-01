/**
 * Feature assertion: the settings navigator has a working search box that
 * filters the settings sections by their title/description.
 *
 * Drives the real UI: opens Settings from the sidebar, types into the search
 * box, and asserts that the rendered section list narrows to matches, shows an
 * empty state for a no-match query, and restores fully when cleared.
 */

import type { Assertion } from '../runner';

const SEARCH_INPUT = '[data-testid="settings-search-input"]';
const ROW = '.settings-item';
const EMPTY = '[data-testid="settings-search-empty"]';

/** Text content (lowercased) of every rendered settings row. */
function readRowTextsExpr(): string {
  return `JSON.stringify(Array.from(document.querySelectorAll(${JSON.stringify(
    ROW,
  )})).map((el) => (el.textContent || '').toLowerCase()))`;
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
  name: 'settings navigator search filters sections',
  async run(app) {
    const { session } = app;

    // App fully mounted.
    await session.waitForFunction(
      '!document.getElementById("_loader") && (document.getElementById("root")?.childElementCount ?? 0) > 0',
      { timeoutMs: 30000, message: 'app did not mount' },
    );

    // Open Settings from the sidebar (real user path).
    await session.click('[data-testid="nav:settings"]', { timeoutMs: 15000 });

    // The search box is part of the feature under test — its presence is the
    // first signal the feature shipped.
    await session.waitForSelector(SEARCH_INPUT, {
      timeoutMs: 15000,
      message: 'settings search input did not render',
    });
    await session.waitForFunction(
      `document.querySelectorAll(${JSON.stringify(ROW)}).length > 1`,
      { timeoutMs: 10000, message: 'settings rows did not render' },
    );

    const allTexts = JSON.parse(await session.evaluate<string>(readRowTextsExpr()));
    const total: number = allTexts.length;
    if (total < 2) throw new Error(`expected multiple settings rows, saw ${total}`);

    // Derive a query from the first row's visible title so the test is
    // locale-independent (the row label is whatever the active language renders).
    const firstLabel = (
      await session.evaluate<string | null>(
        `(() => { const el = document.querySelector(${JSON.stringify(
          ROW,
        )} + ' .font-medium'); return el ? el.textContent : null; })()`,
      )
    )?.trim();
    if (!firstLabel) throw new Error('could not read a settings row label to search for');
    const query = firstLabel.toLowerCase();

    // Type the query and wait for the list to settle to the predicted subset.
    if (!(await session.evaluate<boolean>(setInputExpr(firstLabel)))) {
      throw new Error('search input disappeared before typing');
    }
    const expectedMatches = allTexts.filter((t: string) => t.includes(query)).length;
    await session.waitForFunction(
      `document.querySelectorAll(${JSON.stringify(ROW)}).length === ${expectedMatches}`,
      {
        timeoutMs: 8000,
        message: `filtered list did not narrow to the ${expectedMatches} predicted match(es)`,
      },
    );

    // Every visible row must actually contain the query, and the searched-for
    // section must still be present.
    const visTexts: string[] = JSON.parse(await session.evaluate<string>(readRowTextsExpr()));
    if (visTexts.length === 0) throw new Error('query matched nothing — expected at least its own row');
    if (visTexts.length >= total) {
      throw new Error(`filtering did not reduce the list (${visTexts.length} of ${total})`);
    }
    for (const t of visTexts) {
      if (!t.includes(query)) {
        throw new Error(`visible row "${t}" does not contain query "${query}"`);
      }
    }

    // A no-match query shows the empty state and hides every row.
    await session.evaluate(setInputExpr('zzqqxxnomatchzzqqxx'));
    await session.waitForSelector(EMPTY, {
      timeoutMs: 8000,
      message: 'empty state did not show for a no-match query',
    });
    const noneLeft = await session.evaluate<number>(
      `document.querySelectorAll(${JSON.stringify(ROW)}).length`,
    );
    if (noneLeft !== 0) throw new Error(`expected 0 rows for a no-match query, saw ${noneLeft}`);

    // Clearing restores the full list.
    await session.evaluate(setInputExpr(''));
    await session.waitForFunction(
      `document.querySelectorAll(${JSON.stringify(ROW)}).length === ${total}`,
      { timeoutMs: 8000, message: 'clearing the query did not restore all rows' },
    );
  },
};

export default assertion;
