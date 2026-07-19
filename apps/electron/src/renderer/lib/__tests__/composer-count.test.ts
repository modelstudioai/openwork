import { describe, expect, it } from 'bun:test'
import { computeComposerCounts, shouldShowComposerCount } from '../composer-count'

describe('computeComposerCounts', () => {
  it('returns zeros for an empty string', () => {
    expect(computeComposerCounts('')).toEqual({ words: 0, characters: 0, lines: 0 })
  })

  it('treats whitespace-only text as zero words', () => {
    expect(computeComposerCounts('   \n\t ')).toMatchObject({ words: 0 })
  })

  it('counts a single word', () => {
    expect(computeComposerCounts('hello')).toEqual({ words: 1, characters: 5, lines: 1 })
  })

  it('counts multiple words and includes whitespace in the character count', () => {
    expect(computeComposerCounts('hello world')).toEqual({
      words: 2,
      characters: 11,
      lines: 1,
    })
  })

  it('collapses runs of internal whitespace when counting words', () => {
    expect(computeComposerCounts('  hello   there\tworld  ')).toMatchObject({ words: 3 })
  })

  it('ignores leading/trailing whitespace for word count but keeps it for characters', () => {
    const counts = computeComposerCounts('  hi  ')
    expect(counts.words).toBe(1)
    expect(counts.characters).toBe(6)
  })

  it('counts newline-delimited lines', () => {
    expect(computeComposerCounts('a\nb\nc')).toMatchObject({ lines: 3 })
    expect(computeComposerCounts('a\n')).toMatchObject({ lines: 2 })
  })

  it('counts astral characters (emoji) as one character each', () => {
    // Two emoji + a space => 3 code points, 2 "words".
    expect(computeComposerCounts('😀 🎉')).toEqual({ words: 2, characters: 3, lines: 1 })
  })
})

describe('shouldShowComposerCount', () => {
  it('is false for empty or whitespace-only drafts', () => {
    expect(shouldShowComposerCount('')).toBe(false)
    expect(shouldShowComposerCount('   \n\t')).toBe(false)
  })

  it('is true once there is any non-whitespace content', () => {
    expect(shouldShowComposerCount('x')).toBe(true)
    expect(shouldShowComposerCount('  hi  ')).toBe(true)
  })
})
