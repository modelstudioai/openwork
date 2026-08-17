import { describe, expect, it } from 'vitest';
import { pushRecentCommand } from './command-recents';

describe('OpenWork recent commands', () => {
  it('deduplicates, orders, and caps commands', () => {
    expect(pushRecentCommand(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(pushRecentCommand(['a', 'b', 'c', 'd', 'e', 'f'], 'g')).toEqual([
      'g',
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });
});
