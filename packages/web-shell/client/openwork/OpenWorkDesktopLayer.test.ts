/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { drainOpenWorkDeepLinks } from './OpenWorkDesktopLayer';

describe('OpenWork desktop layer', () => {
  it('processes concurrent deep-link drains exactly once', async () => {
    const pending = ['openwork://new', 'openwork://session/session-1'];
    const take = vi.fn(async () => pending.splice(0));
    const open = vi.fn();

    await Promise.all([
      drainOpenWorkDeepLinks(take, open),
      drainOpenWorkDeepLinks(take, open),
    ]);

    expect(open.mock.calls.map(([value]) => value)).toEqual([
      'openwork://new',
      'openwork://session/session-1',
    ]);

    await drainOpenWorkDeepLinks(async () => undefined, open);
    expect(open).toHaveBeenCalledTimes(2);
  });
});
