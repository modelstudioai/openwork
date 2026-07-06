/**
 * Pure helpers for the composer's live draft count indicator.
 *
 * Kept DOM-free so the counting semantics (Unicode-aware character count,
 * whitespace-collapsing word count, newline-based line count) can be locked
 * down with unit tests. The composer stores its draft as a plain-text string
 * (see `coerceInputText`), so these operate directly on that value.
 */

export interface ComposerCounts {
  /** Whitespace-separated word tokens (0 for empty / whitespace-only text). */
  words: number
  /** Unicode code points, so astral characters (emoji) count as one each. */
  characters: number
  /** Newline-delimited lines (0 for empty text, otherwise `\n` count + 1). */
  lines: number
}

/**
 * Derive the word / character / line counts for a draft.
 *
 * - `characters` counts Unicode code points (`[...text].length`) rather than
 *   UTF-16 units, so a single emoji counts as one character.
 * - `words` splits the trimmed text on any run of whitespace; empty or
 *   whitespace-only input yields `0`.
 * - `lines` is the number of `\n`-delimited lines; empty input yields `0`.
 */
export function computeComposerCounts(text: string): ComposerCounts {
  const characters = [...text].length
  const trimmed = text.trim()
  const words = trimmed === '' ? 0 : trimmed.split(/\s+/u).length
  const lines = text === '' ? 0 : text.split('\n').length
  return { words, characters, lines }
}

/**
 * Whether the count indicator should be shown for a given draft.
 *
 * Only when there is at least one non-whitespace character — an empty (or
 * purely whitespace) composer stays clean.
 */
export function shouldShowComposerCount(text: string): boolean {
  return text.trim().length > 0
}
