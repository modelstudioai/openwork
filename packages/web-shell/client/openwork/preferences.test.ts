/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyOpenWorkPreferences,
  DEFAULT_OPENWORK_PREFERENCES,
  readOpenWorkPreferences,
  writeOpenWorkPreferences,
} from './preferences';

describe('OpenWork desktop preferences', () => {
  beforeEach(() => localStorage.clear());

  it('keeps supported values and resets invalid input', () => {
    expect(readOpenWorkPreferences()).toEqual(DEFAULT_OPENWORK_PREFERENCES);
    writeOpenWorkPreferences({
      presetTheme: 'nord',
      zoom: 125,
      textScale: 1.15,
      highContrast: true,
      reduceMotion: true,
      keepAwake: true,
    });
    expect(readOpenWorkPreferences()).toEqual({
      presetTheme: 'nord',
      zoom: 125,
      textScale: 1.15,
      highContrast: true,
      reduceMotion: true,
      keepAwake: true,
    });
    localStorage.setItem('openwork-desktop-preferences', '{broken');
    expect(readOpenWorkPreferences()).toEqual(DEFAULT_OPENWORK_PREFERENCES);
  });

  it('applies the selected preset to the Web Shell root', () => {
    document.body.innerHTML = '<main data-web-shell-root></main>';
    applyOpenWorkPreferences({
      ...DEFAULT_OPENWORK_PREFERENCES,
      presetTheme: 'nord',
    });
    expect(
      document
        .querySelector<HTMLElement>('[data-web-shell-root]')
        ?.style.getPropertyValue('--background'),
    ).toBe('#2e3440');
  });
});
