/**
 * Example assertion: the app boots and the main React UI mounts.
 *
 * This is the canonical template for new assertions. Copy it, drive the feature
 * you added via `app.session` (waitForSelector / click / getText / evaluate),
 * and assert on what the user would actually see.
 */

import type { Assertion } from '../runner';

const assertion: Assertion = {
  name: 'app boots and main window renders',
  async run(app) {
    const { session } = app;

    // index.html ships a static "#_loader" spinner inside #root. React replaces
    // #root's contents on mount, so the loader disappearing AND #root having
    // element children is a reliable "the app actually rendered" signal — not
    // just "the window opened". (Don't assert on document.title: the app rewrites
    // it to the current view name, e.g. "新建会话", once mounted.)
    await session.waitForFunction(
      '!document.getElementById("_loader") && (document.getElementById("root")?.childElementCount ?? 0) > 0',
      {
        timeoutMs: 30000,
        message: 'React UI did not mount into #root (loader still present or #root empty)',
      },
    );

    // Sanity: this is a real renderer document with a (non-empty) title.
    const title = await session.title();
    if (!title || title.trim().length === 0) {
      throw new Error('document.title is empty — not a real app window');
    }
  },
};

export default assertion;
