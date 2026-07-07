/**
 * Feature assertion: the "Increase contrast" toggle in Settings → Appearance
 * actually applies and persists an app-wide high-contrast preference.
 *
 * Drives the real UI over CDP entirely in the draft/no-session state (no seeded
 * conversation, no backend connection): opens Settings → Appearance, flips the
 * toggle, and asserts the observable effects — the switch state, the
 * `data-high-contrast` attribute on <html>, the persisted localStorage value,
 * AND that the high-contrast CSS actually applies (the `--hc-enabled` custom
 * property computes to `1` on :root only while enabled). Toggling twice proves
 * it both applies and reverts, not merely renders.
 */

import type { Assertion } from '../runner';

const SETTINGS_NAV = '[data-testid="nav:settings"]';
const APPEARANCE_NAV = '[data-testid="settings-nav-appearance"]';
const TOGGLE = '[data-testid="high-contrast-toggle"]';
const STORAGE_KEY = 'craft-high-contrast';

/** Read the toggle's aria-checked ("true" | "false" | null). */
function ariaCheckedExpr(): string {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(TOGGLE)});
    return el ? el.getAttribute('aria-checked') : null;
  })()`;
}

/** True when <html> carries the high-contrast marker attribute. */
function htmlMarkedExpr(): string {
  return `document.documentElement.getAttribute('data-high-contrast') === 'true'`;
}

/** True when the high-contrast CSS block actually matched (marker custom prop). */
function cssAppliedExpr(): string {
  return `getComputedStyle(document.documentElement).getPropertyValue('--hc-enabled').trim() === '1'`;
}

/** The persisted localStorage value for the preference. */
function storedValueExpr(): string {
  return `window.localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`;
}

const assertion: Assertion = {
  name: 'increase-contrast toggle applies and persists an app-wide preference',
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
      message: 'increase-contrast toggle did not render',
    });

    // Initial state: off, no marker on <html>, CSS not applied, not persisted true.
    const initialChecked = await session.evaluate<string | null>(ariaCheckedExpr());
    if (initialChecked !== 'false') {
      throw new Error(`expected toggle off initially, saw aria-checked=${initialChecked}`);
    }
    if (await session.evaluate<boolean>(htmlMarkedExpr())) {
      throw new Error('expected no data-high-contrast attribute before enabling');
    }
    if (await session.evaluate<boolean>(cssAppliedExpr())) {
      throw new Error('expected --hc-enabled to be unset before enabling');
    }

    // Enable → toggle on, <html> marked, CSS applied, persisted true.
    await session.click(TOGGLE);
    await session.waitForFunction(
      `${ariaCheckedExpr()} === 'true'`,
      { timeoutMs: 5000, message: 'toggle did not switch on' },
    );
    await session.waitForFunction(htmlMarkedExpr(), {
      timeoutMs: 5000,
      message: 'data-high-contrast was not applied to <html> when enabled',
    });
    await session.waitForFunction(cssAppliedExpr(), {
      timeoutMs: 5000,
      message: 'high-contrast CSS did not apply (--hc-enabled !== 1) when enabled',
    });
    const storedOn = await session.evaluate<string | null>(storedValueExpr());
    if (storedOn !== 'true') {
      throw new Error(`expected persisted "true" after enabling, saw ${JSON.stringify(storedOn)}`);
    }

    // Disable → toggle off, marker removed, CSS reverted, persisted false.
    await session.click(TOGGLE);
    await session.waitForFunction(
      `${ariaCheckedExpr()} === 'false'`,
      { timeoutMs: 5000, message: 'toggle did not switch off' },
    );
    await session.waitForFunction(`!(${htmlMarkedExpr()})`, {
      timeoutMs: 5000,
      message: 'data-high-contrast was not removed from <html> when disabled',
    });
    await session.waitForFunction(`!(${cssAppliedExpr()})`, {
      timeoutMs: 5000,
      message: 'high-contrast CSS did not revert (--hc-enabled still 1) when disabled',
    });
    const storedOff = await session.evaluate<string | null>(storedValueExpr());
    if (storedOff !== 'false') {
      throw new Error(`expected persisted "false" after disabling, saw ${JSON.stringify(storedOff)}`);
    }
  },
};

export default assertion;
