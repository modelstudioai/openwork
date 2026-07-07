/**
 * Feature assertion: the "Chat text size" segmented control in
 * Settings → Appearance actually applies and persists an app-wide preference
 * that scales conversation typography.
 *
 * Drives the real UI over CDP in the draft/no-session state (no seeded
 * conversation, no backend): opens Settings → Appearance and clicks through the
 * Small / Default / Large segments, asserting the observable effects at each
 * step:
 *   - the selected segment's `aria-checked`,
 *   - the `data-chat-text-size` attribute on <html>,
 *   - the resolved `--chat-font-scale` CSS custom property,
 *   - the persisted `localStorage` value, and
 *   - crucially, the *rendered* computed `font-size` of a probe element that
 *     carries the real `.chat-text-scope` class the transcript uses — proving
 *     the mechanism produces a real pixel-level text-size change, not merely an
 *     attribute flip.
 *
 * Cycling Default → Large → Small → Default proves it applies, changes, and
 * reverts.
 */

import type { Assertion } from '../runner';

const SETTINGS_NAV = '[data-testid="nav:settings"]';
const APPEARANCE_NAV = '[data-testid="settings-nav-appearance"]';
const CONTROL = '[data-testid="chat-text-size-control"]';
const STORAGE_KEY = 'craft-chat-text-size';

/** Selector for a specific segment button. */
function segment(value: string): string {
  return `${CONTROL} [data-value="${value}"]`;
}

/** aria-checked ("true" | "false" | null) for a specific segment. */
function ariaCheckedExpr(value: string): string {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(segment(value))});
    return el ? el.getAttribute('aria-checked') : null;
  })()`;
}

/** The current data-chat-text-size marker on <html>. */
const htmlAttrExpr = `document.documentElement.getAttribute('data-chat-text-size')`;

/** The resolved --chat-font-scale custom property (trimmed string). */
const cssScaleExpr = `getComputedStyle(document.documentElement).getPropertyValue('--chat-font-scale').trim()`;

/** The persisted localStorage value for the preference. */
const storedValueExpr = `window.localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`;

/**
 * Computed font-size (px, number) of a hidden probe that carries the real
 * `.chat-text-scope` class — i.e. the exact CSS the transcript applies. This
 * reflects the live `--chat-font-scale` end-to-end (html attr → CSS var →
 * rendered pixels).
 */
const probeFontSizeExpr = `(() => {
  let p = document.getElementById('__cts_probe');
  if (!p) {
    p = document.createElement('div');
    p.id = '__cts_probe';
    p.className = 'chat-text-scope';
    p.style.position = 'fixed';
    p.style.left = '-9999px';
    p.style.top = '0';
    p.textContent = 'probe';
    document.body.appendChild(p);
  }
  return parseFloat(getComputedStyle(p).fontSize);
})()`;

const assertion: Assertion = {
  name: 'chat text size control scales conversation typography and persists',
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
      message: 'chat-text-size control did not render',
    });

    // Initial state: Default selected, <html> marked "medium", scale 1.
    const initialChecked = await session.evaluate<string | null>(ariaCheckedExpr('medium'));
    if (initialChecked !== 'true') {
      throw new Error(`expected Default selected initially, saw medium aria-checked=${initialChecked}`);
    }
    if (await session.evaluate<string | null>(htmlAttrExpr) !== 'medium') {
      throw new Error('expected data-chat-text-size="medium" initially');
    }

    // Baseline rendered size at Default (scale 1).
    const mediumScale = await session.evaluate<string>(cssScaleExpr);
    if (mediumScale !== '1') {
      throw new Error(`expected --chat-font-scale "1" at Default, saw ${JSON.stringify(mediumScale)}`);
    }
    const mediumPx = await session.evaluate<number>(probeFontSizeExpr);
    if (!(mediumPx > 0)) {
      throw new Error(`probe font-size at Default was not positive: ${mediumPx}`);
    }

    // ----- Large -----
    await session.click(segment('large'));
    await session.waitForFunction(`${ariaCheckedExpr('large')} === 'true'`, {
      timeoutMs: 5000,
      message: 'Large segment did not become selected',
    });
    await session.waitForFunction(`${htmlAttrExpr} === 'large'`, {
      timeoutMs: 5000,
      message: 'data-chat-text-size was not set to "large"',
    });
    const largeScale = await session.evaluate<string>(cssScaleExpr);
    if (largeScale !== '1.15') {
      throw new Error(`expected --chat-font-scale "1.15" at Large, saw ${JSON.stringify(largeScale)}`);
    }
    const storedLarge = await session.evaluate<string | null>(storedValueExpr);
    if (storedLarge !== '"large"') {
      throw new Error(`expected persisted "large", saw ${JSON.stringify(storedLarge)}`);
    }
    const largePx = await session.evaluate<number>(probeFontSizeExpr);
    // Real rendered effect: Large must be measurably bigger than Default.
    if (!(largePx > mediumPx)) {
      throw new Error(`expected Large probe font-size (${largePx}px) > Default (${mediumPx}px)`);
    }
    const largeRatio = largePx / mediumPx;
    if (Math.abs(largeRatio - 1.15) > 0.02) {
      throw new Error(`expected Large/Default font-size ratio ~1.15, saw ${largeRatio.toFixed(3)}`);
    }

    // ----- Small -----
    await session.click(segment('small'));
    await session.waitForFunction(`${ariaCheckedExpr('small')} === 'true'`, {
      timeoutMs: 5000,
      message: 'Small segment did not become selected',
    });
    await session.waitForFunction(`${htmlAttrExpr} === 'small'`, {
      timeoutMs: 5000,
      message: 'data-chat-text-size was not set to "small"',
    });
    const smallScale = await session.evaluate<string>(cssScaleExpr);
    if (smallScale !== '0.9') {
      throw new Error(`expected --chat-font-scale "0.9" at Small, saw ${JSON.stringify(smallScale)}`);
    }
    const smallPx = await session.evaluate<number>(probeFontSizeExpr);
    if (!(smallPx < mediumPx)) {
      throw new Error(`expected Small probe font-size (${smallPx}px) < Default (${mediumPx}px)`);
    }
    const smallRatio = smallPx / mediumPx;
    if (Math.abs(smallRatio - 0.9) > 0.02) {
      throw new Error(`expected Small/Default font-size ratio ~0.9, saw ${smallRatio.toFixed(3)}`);
    }

    // ----- Revert to Default -----
    await session.click(segment('medium'));
    await session.waitForFunction(`${ariaCheckedExpr('medium')} === 'true'`, {
      timeoutMs: 5000,
      message: 'Default segment did not become re-selected',
    });
    await session.waitForFunction(`${htmlAttrExpr} === 'medium'`, {
      timeoutMs: 5000,
      message: 'data-chat-text-size did not revert to "medium"',
    });
    const revertedPx = await session.evaluate<number>(probeFontSizeExpr);
    if (Math.abs(revertedPx - mediumPx) > 0.5) {
      throw new Error(`expected probe font-size to revert to Default (${mediumPx}px), saw ${revertedPx}px`);
    }
    const storedReverted = await session.evaluate<string | null>(storedValueExpr);
    if (storedReverted !== '"medium"') {
      throw new Error(`expected persisted "medium" after revert, saw ${JSON.stringify(storedReverted)}`);
    }
  },
};

export default assertion;
