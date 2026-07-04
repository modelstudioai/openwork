import { describe, it, expect, beforeEach } from 'bun:test'
import {
  MAX_PROMPT_HISTORY,
  pushPromptHistory,
  prevPromptIndex,
  nextPromptIndex,
  promptAt,
  getPromptHistory,
  recordPrompt,
} from '../prompt-history'

describe('prompt-history', () => {
  describe('pushPromptHistory', () => {
    it('appends a new prompt to the end (newest last)', () => {
      expect(pushPromptHistory(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
    })

    it('trims the entry before storing', () => {
      expect(pushPromptHistory([], '  hello  ')).toEqual(['hello'])
    })

    it('ignores empty / whitespace-only entries', () => {
      expect(pushPromptHistory(['a'], '')).toEqual(['a'])
      expect(pushPromptHistory(['a'], '   ')).toEqual(['a'])
    })

    it('collapses an immediate repeat of the most recent entry', () => {
      expect(pushPromptHistory(['a', 'b'], 'b')).toEqual(['a', 'b'])
      // trimming still applies to the repeat check
      expect(pushPromptHistory(['a', 'b'], '  b  ')).toEqual(['a', 'b'])
    })

    it('keeps a non-consecutive repeat (only immediate repeats collapse)', () => {
      expect(pushPromptHistory(['a', 'b'], 'a')).toEqual(['a', 'b', 'a'])
    })

    it('caps the list to MAX_PROMPT_HISTORY, dropping the oldest', () => {
      const existing = Array.from({ length: MAX_PROMPT_HISTORY }, (_, i) => `p-${i}`)
      const result = pushPromptHistory(existing, 'newest')
      expect(result.length).toBe(MAX_PROMPT_HISTORY)
      expect(result[result.length - 1]).toBe('newest')
      expect(result[0]).toBe('p-1') // 'p-0' was dropped
      expect(result).not.toContain('p-0')
    })

    it('does not mutate the input array', () => {
      const input = ['a', 'b']
      pushPromptHistory(input, 'c')
      expect(input).toEqual(['a', 'b'])
    })
  })

  describe('prevPromptIndex (Up / older)', () => {
    const history = ['first', 'second', 'third'] // newest last

    it('starts at the newest entry when not yet recalling', () => {
      expect(prevPromptIndex(history, null)).toBe(2)
    })

    it('steps one entry older on each subsequent Up', () => {
      expect(prevPromptIndex(history, 2)).toBe(1)
      expect(prevPromptIndex(history, 1)).toBe(0)
    })

    it('clamps at the oldest entry', () => {
      expect(prevPromptIndex(history, 0)).toBe(0)
    })

    it('returns null when there is no history', () => {
      expect(prevPromptIndex([], null)).toBeNull()
    })
  })

  describe('nextPromptIndex (Down / newer)', () => {
    const history = ['first', 'second', 'third']

    it('does nothing when not recalling', () => {
      expect(nextPromptIndex(history, null)).toBeNull()
    })

    it('steps one entry newer', () => {
      expect(nextPromptIndex(history, 0)).toBe(1)
      expect(nextPromptIndex(history, 1)).toBe(2)
    })

    it('returns null (exit recall / restore draft) past the newest entry', () => {
      expect(nextPromptIndex(history, 2)).toBeNull()
    })
  })

  describe('promptAt', () => {
    const history = ['first', 'second', 'third']

    it('returns the entry at a valid index', () => {
      expect(promptAt(history, 0)).toBe('first')
      expect(promptAt(history, 2)).toBe('third')
    })

    it('returns null when not recalling or out of range', () => {
      expect(promptAt(history, null)).toBeNull()
      expect(promptAt(history, -1)).toBeNull()
      expect(promptAt(history, 3)).toBeNull()
    })
  })

  describe('Up/Down round trip', () => {
    it('walks back with Up and forward with Down, restoring the draft', () => {
      const history = ['one', 'two', 'three']
      // Up, Up, Up
      let idx = prevPromptIndex(history, null)
      expect(promptAt(history, idx)).toBe('three')
      idx = prevPromptIndex(history, idx)
      expect(promptAt(history, idx)).toBe('two')
      idx = prevPromptIndex(history, idx)
      expect(promptAt(history, idx)).toBe('one')
      // Down, Down back to newest
      idx = nextPromptIndex(history, idx)
      expect(promptAt(history, idx)).toBe('two')
      idx = nextPromptIndex(history, idx)
      expect(promptAt(history, idx)).toBe('three')
      // One more Down exits recall (restore the original draft)
      idx = nextPromptIndex(history, idx)
      expect(idx).toBeNull()
      expect(promptAt(history, idx)).toBeNull()
    })
  })

  describe('persistence (getPromptHistory / recordPrompt)', () => {
    beforeEach(() => {
      const store = new Map<string, string>()
      // Minimal localStorage stub so the storage helper can round-trip in bun.
      ;(globalThis as { localStorage?: unknown }).localStorage = {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
        key: () => null,
        length: 0,
      }
    })

    it('returns an empty list when nothing has been recorded', () => {
      expect(getPromptHistory()).toEqual([])
    })

    it('records prompts and reads them back (newest last)', () => {
      recordPrompt('hello')
      recordPrompt('world')
      expect(getPromptHistory()).toEqual(['hello', 'world'])
    })

    it('applies push semantics (trim + immediate-repeat collapse) when recording', () => {
      recordPrompt('  a  ')
      recordPrompt('a')
      expect(getPromptHistory()).toEqual(['a'])
    })
  })
})
