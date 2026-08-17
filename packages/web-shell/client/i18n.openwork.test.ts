import { describe, expect, it } from 'vitest';
import { getTranslator, normalizeLanguage } from './i18n';

describe('OpenWork legacy locales', () => {
  it('normalizes regional variants and falls back to English', () => {
    expect(normalizeLanguage('de-DE')).toBe('de');
    expect(normalizeLanguage('ja_JP')).toBe('ja');
    expect(getTranslator('de')('openwork.action.settings')).toBe(
      'Einstellungen',
    );
    expect(getTranslator('de')('openwork.appearance.pet')).toBe('Desktop pet');
  });
});
