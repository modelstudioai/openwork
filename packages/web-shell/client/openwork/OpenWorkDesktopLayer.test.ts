/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { openInOpenWorkBrowser } from './OpenWorkDesktopLayer';

describe('OpenWork browser links', () => {
  afterEach(() => {
    delete (window as Window & { __TAURI__?: unknown }).__TAURI__;
  });

  it('only intercepts HTTP links in the Tauri desktop shell', () => {
    expect(openInOpenWorkBrowser('https://qwen.ai/docs')).toBe(false);

    (window as Window & { __TAURI__?: unknown }).__TAURI__ = {
      core: { invoke: vi.fn() },
    };
    const opened: string[] = [];
    window.addEventListener(
      'openwork:open-browser',
      (event) => opened.push((event as CustomEvent<string>).detail),
      { once: true },
    );

    expect(openInOpenWorkBrowser('mailto:help@qwen.ai')).toBe(false);
    expect(openInOpenWorkBrowser('https://user:secret@qwen.ai')).toBe(false);
    expect(openInOpenWorkBrowser('https://qwen.ai/docs')).toBe(true);
    expect(opened).toEqual(['https://qwen.ai/docs']);
  });
});
