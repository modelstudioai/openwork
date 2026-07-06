/**
 * Feature assertion: the "Reduce motion" toggle in Settings → Appearance
 * actually applies and persists an app-wide reduced-motion preference.
 *
 * Drives the real UI over CDP entirely in the draft/no-session state (no seeded
 * conversation, no backend connection): opens Settings → Appearance, flips the
 * toggle, and asserts the observable effects — the switch state, the
 * `data-reduce-motion` attribute on <html>, and the persisted localStorage value.
 * Toggling twice proves it both applies and reverts, not merely renders.
 */

import type { Assertion } from '../runner';

const SETTINGS_NAV = '[data-testid="nav:settings"]';
const APPEARANCE_NAV = '[data-testid="settings-nav-appearance"]';
const TOGGLE = '[data-testid="reduce-motion-toggle"]';
const STORAGE_KEY = 'craft-reduce-motion';

/** Read the toggle's aria-checked ("true" | "false" | null). */
function ariaCheckedExpr(): string {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(TOGGLE)});
    return el ? el.getAttribute('aria-checked') : null;
  })()`;
}

/** True when <html> carries the reduce-motion marker attribute. */
function htmlMarkedExpr(): string {
  return `document.documentElement.getAttribute('data-reduce-motion') === 'true'`;
}

/** The persisted localStorage value for the preference. */
function storedValueExpr(): string {
  return `window.localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`;
}

const assertion: Assertion = {
  name: 'reduce-motion toggle applies and persists an app-wide preference',
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

    // The toggle is the feature under test — its presence is the first signal.
    await session.waitForSelector(TOGGLE, {
      timeoutMs: 15000,
      message: 'reduce-motion toggle did not render',
    });

    // Initial state: off, no marker on <html>, not persisted true.
    const initialChecked = await session.evaluate<string | null>(ariaCheckedExpr());
    if (initialChecked !== 'false') {
      throw new Error(`expected toggle off initially, saw aria-checked=${initialChecked}`);
    }
    if (await session.evaluate<boolean>(htmlMarkedExpr())) {
      throw new Error('expected no data-reduce-motion attribute before enabling');
    }

    // Enable → toggle on, <html> marked, persisted true.
    await session.click(TOGGLE);
    await session.waitForFunction(
      `${ariaCheckedExpr()} === 'true'`,
      { timeoutMs: 5000, message: 'toggle did not switch on' },
    );
    await session.waitForFunction(htmlMarkedExpr(), {
      timeoutMs: 5000,
      message: 'data-reduce-motion was not applied to <html> when enabled',
    });
    const storedOn = await session.evaluate<string | null>(storedValueExpr());
    if (storedOn !== 'true') {
      throw new Error(`expected persisted "true" after enabling, saw ${JSON.stringify(storedOn)}`);
    }

    // Disable → toggle off, marker removed, persisted false.
    await session.click(TOGGLE);
    await session.waitForFunction(
      `${ariaCheckedExpr()} === 'false'`,
      { timeoutMs: 5000, message: 'toggle did not switch off' },
    );
    await session.waitForFunction(`!(${htmlMarkedExpr()})`, {
      timeoutMs: 5000,
      message: 'data-reduce-motion was not removed from <html> when disabled',
    });
    const storedOff = await session.evaluate<string | null>(storedValueExpr());
    if (storedOff !== 'false') {
      throw new Error(`expected persisted "false" after disabling, saw ${JSON.stringify(storedOff)}`);
    }
  },
};

export default assertion;
