/**
 * Feature assertion: the interface-zoom control in Settings → Appearance
 * actually scales the whole renderer and persists the preference.
 *
 * Drives the real UI over CDP entirely in the draft/no-session state (no seeded
 * conversation, no backend): opens Settings → Appearance → Interface, uses the
 * Zoom stepper, and asserts the observable effects — the displayed percentage,
 * the inline `zoom` style on <html> (which is what scales the app), and the
 * persisted localStorage value. Zooming in then resetting proves it both
 * applies and reverts, not merely renders.
 */

import type { Assertion } from '../runner';

const SETTINGS_NAV = '[data-testid="nav:settings"]';
const APPEARANCE_NAV = '[data-testid="settings-nav-appearance"]';
const ZOOM_CONTROL = '[data-testid="zoom-control"]';
const ZOOM_IN = '[data-testid="zoom-in"]';
const ZOOM_RESET = '[data-testid="zoom-reset"]';
const ZOOM_VALUE = '[data-testid="zoom-value"]';
const STORAGE_KEY = 'craft-zoom-level';

/** The stepper's displayed percentage text (e.g. "100%"). */
function valueTextExpr(): string {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(ZOOM_VALUE)});
    return el ? el.textContent : null;
  })()`;
}

/** The inline zoom factor applied to <html> ("" when unset). */
function htmlZoomExpr(): string {
  return `document.documentElement.style.zoom`;
}

/** The persisted localStorage value for the preference. */
function storedValueExpr(): string {
  return `window.localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`;
}

const assertion: Assertion = {
  name: 'interface zoom scales <html> and persists the preference',
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

    // The zoom control is the feature under test — its presence is the first signal.
    await session.waitForSelector(ZOOM_CONTROL, {
      timeoutMs: 15000,
      message: 'zoom control did not render',
    });

    // Initial state: 100%, no inline zoom on <html>.
    const initialText = await session.evaluate<string | null>(valueTextExpr());
    if (initialText !== '100%') {
      throw new Error(`expected "100%" initially, saw ${JSON.stringify(initialText)}`);
    }
    const initialZoom = await session.evaluate<string>(htmlZoomExpr());
    if (initialZoom !== '') {
      throw new Error(`expected no inline zoom on <html> initially, saw ${JSON.stringify(initialZoom)}`);
    }

    // Zoom in → percentage rises, <html> scaled, persisted.
    await session.click(ZOOM_IN);
    await session.waitForFunction(
      `${valueTextExpr()} === '110%'`,
      { timeoutMs: 5000, message: 'zoom-in did not raise the displayed percentage to 110%' },
    );
    await session.waitForFunction(
      `${htmlZoomExpr()} === '1.1'`,
      { timeoutMs: 5000, message: 'zoom-in did not apply zoom:1.1 to <html>' },
    );
    const storedOn = await session.evaluate<string | null>(storedValueExpr());
    if (storedOn !== '1.1') {
      throw new Error(`expected persisted "1.1" after zoom-in, saw ${JSON.stringify(storedOn)}`);
    }

    // Reset → back to 100%, inline zoom cleared, persisted default restored.
    await session.click(ZOOM_RESET);
    await session.waitForFunction(
      `${valueTextExpr()} === '100%'`,
      { timeoutMs: 5000, message: 'reset did not return the displayed percentage to 100%' },
    );
    await session.waitForFunction(
      `${htmlZoomExpr()} === ''`,
      { timeoutMs: 5000, message: 'reset did not clear the inline zoom on <html>' },
    );
    const storedOff = await session.evaluate<string | null>(storedValueExpr());
    if (storedOff !== '1') {
      throw new Error(`expected persisted "1" after reset, saw ${JSON.stringify(storedOff)}`);
    }
  },
};

export default assertion;
