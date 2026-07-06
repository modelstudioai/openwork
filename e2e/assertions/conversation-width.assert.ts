/**
 * Feature assertion: the "Conversation width" segmented control in
 * Settings → Appearance actually applies and persists an app-wide reading-column
 * width preference.
 *
 * Drives the real UI over CDP entirely in the draft/no-session state (no seeded
 * conversation, no backend connection): opens Settings → Appearance, selects each
 * width option, and asserts the observable effects that the transcript + composer
 * consume — the selected radio state, the `data-conversation-width` attribute on
 * <html>, the computed `--chat-content-max-width` CSS custom property (the value
 * the chat containers read via `max-width: var(--chat-content-max-width, 840px)`),
 * and the persisted localStorage value.
 *
 * Cycling through all three options proves it both applies and reverts, not merely
 * renders.
 */

import type { Assertion } from '../runner';

const SETTINGS_NAV = '[data-testid="nav:settings"]';
const APPEARANCE_NAV = '[data-testid="settings-nav-appearance"]';
const CONTROL = '[data-testid="conversation-width-control"]';
const STORAGE_KEY = 'craft-conversation-width';

type Mode = 'comfortable' | 'wide' | 'full';

const EXPECTED_MAX_WIDTH: Record<Mode, string> = {
  comfortable: '840px',
  wide: '1100px',
  full: 'none',
};

/** aria-checked ("true" | "false" | null) for a given option button. */
function optionCheckedExpr(mode: Mode): string {
  return `(() => {
    const el = document.querySelector('[data-testid="conversation-width-control-${mode}"]');
    return el ? el.getAttribute('aria-checked') : null;
  })()`;
}

/** The `data-conversation-width` marker value on <html>. */
function htmlModeExpr(): string {
  return `document.documentElement.getAttribute('data-conversation-width')`;
}

/** The computed `--chat-content-max-width` custom property on <html>. */
function cssVarExpr(): string {
  return `getComputedStyle(document.documentElement).getPropertyValue('--chat-content-max-width').trim()`;
}

/** The persisted localStorage value (JSON-encoded string) for the preference. */
function storedValueExpr(): string {
  return `window.localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`;
}

const assertion: Assertion = {
  name: 'conversation-width control applies and persists an app-wide width preference',
  async run(app) {
    const { session } = app;

    // App fully mounted.
    await session.waitForFunction(
      '!document.getElementById("_loader") && (document.getElementById("root")?.childElementCount ?? 0) > 0',
      { timeoutMs: 30000, message: 'app did not mount' },
    );

    // Open Settings → Appearance (real user path).
    await session.click(SETTINGS_NAV, { timeoutMs: 15000 });
    await session.click(APPEARANCE_NAV, { timeoutMs: 15000 });

    // The control is the feature under test — its presence is the first signal.
    await session.waitForSelector(CONTROL, {
      timeoutMs: 15000,
      message: 'conversation-width control did not render',
    });

    // Initial state: comfortable selected, <html> marked comfortable, 840px column.
    const initialChecked = await session.evaluate<string | null>(optionCheckedExpr('comfortable'));
    if (initialChecked !== 'true') {
      throw new Error(`expected "comfortable" selected initially, saw aria-checked=${initialChecked}`);
    }
    const initialMode = await session.evaluate<string | null>(htmlModeExpr());
    if (initialMode !== 'comfortable') {
      throw new Error(`expected data-conversation-width="comfortable" initially, saw ${JSON.stringify(initialMode)}`);
    }
    const initialVar = await session.evaluate<string>(cssVarExpr());
    if (initialVar !== EXPECTED_MAX_WIDTH.comfortable) {
      throw new Error(`expected --chat-content-max-width=840px initially, saw ${JSON.stringify(initialVar)}`);
    }

    // Selecting each mode applies + persists; the final "comfortable" proves revert.
    const sequence: Mode[] = ['full', 'wide', 'comfortable'];
    for (const mode of sequence) {
      await session.click(`[data-testid="conversation-width-control-${mode}"]`);

      // Radio state flips on.
      await session.waitForFunction(
        `${optionCheckedExpr(mode)} === 'true'`,
        { timeoutMs: 5000, message: `"${mode}" option did not become selected` },
      );

      // <html> marker updates.
      await session.waitForFunction(
        `${htmlModeExpr()} === ${JSON.stringify(mode)}`,
        { timeoutMs: 5000, message: `data-conversation-width did not update to "${mode}"` },
      );

      // CSS custom property (what the chat containers actually read) updates.
      await session.waitForFunction(
        `${cssVarExpr()} === ${JSON.stringify(EXPECTED_MAX_WIDTH[mode])}`,
        { timeoutMs: 5000, message: `--chat-content-max-width did not become ${EXPECTED_MAX_WIDTH[mode]} for "${mode}"` },
      );

      // Persisted (JSON-encoded string).
      const stored = await session.evaluate<string | null>(storedValueExpr());
      if (stored !== JSON.stringify(mode)) {
        throw new Error(`expected persisted ${JSON.stringify(JSON.stringify(mode))} after selecting "${mode}", saw ${JSON.stringify(stored)}`);
      }
    }
  },
};

export default assertion;
