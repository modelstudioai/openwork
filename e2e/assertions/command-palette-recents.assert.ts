/**
 * Feature assertion: the command palette's "Recently used" group.
 *
 * Drives the real built app over CDP in the draft (no-session) state — no
 * seeded conversation and no backend. It proves the full recents lifecycle:
 *   seed one recent → it renders in a dedicated "Recently used" group →
 *   a search query hides the group → clearing restores it → running a *new*
 *   action from the palette records it and, on reopen, it is the top recent.
 *
 * The reopen step is the load-bearing one: reading the palette after running
 * an action proves the palette actually *persists* what you run and surfaces
 * it newest-first — not merely that a seeded list can render.
 */

import type { Assertion } from '../runner';

const PALETTE = '[data-testid="command-palette"]';
const INPUT = '[data-testid="command-palette-input"]';
const ITEM = '[data-testid="command-palette-item"]';
const RECENT = '[data-testid="command-palette-recent-item"]';

/** localStorage key the palette reads recents from (shared helper's `craft-` prefix). */
const RECENTS_KEY = 'craft-command-palette-recents';

/** Elements actually visible (cmdk keeps filtered rows in the DOM but hidden). */
function visibleExpr(selector: string): string {
  return `[...document.querySelectorAll(${JSON.stringify(selector)})].filter(el => el.offsetParent !== null)`;
}

/** Visible text of each matching row, in DOM order. */
function textsExpr(selector: string): string {
  return `${visibleExpr(selector)}.map(el => (el.textContent || '').trim())`;
}

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

/** Dispatch the Cmd/Ctrl+K palette hotkey at the window level (both modifiers for cross-platform). */
const OPEN_PALETTE_EXPR = `(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'k', code: 'KeyK', ctrlKey: true, metaKey: true, bubbles: true, cancelable: true,
  }));
  return true;
})()`;

const assertion: Assertion = {
  name: 'command palette surfaces and records recently-used actions',
  async run(app) {
    const { session } = app;

    // App must be mounted and at the ready AppShell state.
    await session.waitForFunction(
      '!document.getElementById("_loader") && (document.getElementById("root")?.childElementCount ?? 0) > 0',
      { timeoutMs: 30000, message: 'React UI did not mount' },
    );
    await session.waitForSelector('[aria-label="Craft menu"]', {
      timeoutMs: 30000,
      message: 'app did not reach the ready AppShell state',
    });

    // 1. Seed a single recent action. The palette reads recents from
    //    localStorage each time it opens, so no reload is needed.
    const seeded = await session.evaluate<boolean>(`(() => {
      localStorage.setItem(${JSON.stringify(RECENTS_KEY)}, JSON.stringify(['app.toggleTheme']));
      return true;
    })()`);
    if (!seeded) throw new Error('failed to seed command-palette recents');

    // 2. Open the palette; the "Recently used" group shows exactly the seeded action.
    if (!(await session.evaluate<boolean>(OPEN_PALETTE_EXPR))) {
      throw new Error('failed to dispatch command-palette hotkey');
    }
    await session.waitForSelector(PALETTE, {
      timeoutMs: 8000,
      message: 'command palette did not open on Ctrl/Cmd+K',
    });
    await session.waitForFunction(`${visibleExpr(RECENT)}.length === 1`, {
      timeoutMs: 5000,
      message: 'seeded "Recently used" group did not render exactly one row',
    });
    const firstRecent = await session.evaluate<string[]>(textsExpr(RECENT));
    if (!/toggle theme/i.test(firstRecent[0] || '')) {
      throw new Error(`expected seeded recent to be "Toggle Theme", got ${JSON.stringify(firstRecent)}`);
    }

    // 2b. The recent row renders ABOVE the first category row.
    const recentIsFirst = await session.evaluate<boolean>(`(() => {
      const recent = ${visibleExpr(RECENT)}[0];
      const item = ${visibleExpr(ITEM)}[0];
      if (!recent || !item) return false;
      return !!(recent.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING);
    })()`);
    if (!recentIsFirst) {
      throw new Error('"Recently used" group did not render above the first category');
    }

    // 3. Typing a query hides the recents group (recency yields to relevance),
    //    while normal filtering still works (a matching category row survives).
    await session.evaluate(setInputExpr('sidebar'));
    await session.waitForFunction(`${visibleExpr(RECENT)}.length === 0`, {
      timeoutMs: 5000,
      message: 'recents group did not hide while searching',
    });
    await session.waitForFunction(
      `${visibleExpr(ITEM)}.some(el => /toggle sidebar/i.test(el.textContent || ''))`,
      { timeoutMs: 5000, message: 'expected a "Toggle Sidebar" match while filtering by "sidebar"' },
    );

    // 4. Clearing the query brings the recents group back.
    await session.evaluate(setInputExpr(''));
    await session.waitForFunction(`${visibleExpr(RECENT)}.length === 1`, {
      timeoutMs: 5000,
      message: 'recents group did not reappear after clearing the query',
    });

    // 5. Run a *new* (not-yet-recent) action from the palette: Toggle Sidebar.
    const clicked = await session.evaluate<boolean>(`(() => {
      const el = ${visibleExpr(ITEM)}.find(el => /toggle sidebar/i.test(el.textContent || ''));
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!clicked) throw new Error('could not click the "Toggle Sidebar" row');
    await session.waitForFunction(`!document.querySelector(${JSON.stringify(PALETTE)})`, {
      timeoutMs: 5000,
      message: 'palette did not close after running an action',
    });

    // 6. Reopen: the just-run action is now the top recent, ahead of the seed —
    //    proving the palette recorded it and orders recents newest-first.
    if (!(await session.evaluate<boolean>(OPEN_PALETTE_EXPR))) {
      throw new Error('failed to reopen the command palette');
    }
    await session.waitForSelector(PALETTE, {
      timeoutMs: 8000,
      message: 'command palette did not reopen',
    });
    await session.waitForFunction(`${visibleExpr(RECENT)}.length === 2`, {
      timeoutMs: 5000,
      message: 'recents group did not grow to two rows after running a new action',
    });
    const recents = await session.evaluate<string[]>(textsExpr(RECENT));
    if (!/toggle sidebar/i.test(recents[0] || '')) {
      throw new Error(`expected "Toggle Sidebar" as the top recent, got ${JSON.stringify(recents)}`);
    }
    if (!/toggle theme/i.test(recents[1] || '')) {
      throw new Error(`expected "Toggle Theme" as the second recent, got ${JSON.stringify(recents)}`);
    }
  },
};

export default assertion;
