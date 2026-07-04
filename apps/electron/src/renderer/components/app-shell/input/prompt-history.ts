import * as storage from '@/lib/local-storage'

/**
 * Prompt history for the chat composer.
 *
 * Mirrors the "recall your previous prompt with the Up arrow" affordance that
 * terminal shells, the Claude Code CLI, and the Codex desktop composer all
 * provide: pressing Up in an empty (or already-recalling) composer walks
 * backwards through the prompts you have sent, and Down walks forward again,
 * restoring the draft you started from once you page past the newest entry.
 *
 * The list is stored newest-**last** (append order) and persisted globally in
 * the renderer's localStorage, so history survives restarts and is shared
 * across sessions — the same behaviour as a shell's history file.
 *
 * The navigation model is index-based and deliberately pure so it can be unit
 * tested without a DOM: `null` means "not currently recalling", otherwise the
 * index points at the entry in `history` currently shown in the composer.
 */

export const MAX_PROMPT_HISTORY = 100

/**
 * Append a submitted prompt to the history list.
 * - Trims the entry; empty/whitespace-only entries are ignored.
 * - Collapses an immediate repeat (same as the most recent entry) so hammering
 *   the same prompt doesn't bloat the list.
 * - Caps the list to {@link MAX_PROMPT_HISTORY}, dropping the oldest entries.
 *
 * Returns a new array; the input is never mutated.
 */
export function pushPromptHistory(
  history: string[],
  entry: string,
  maxEntries = MAX_PROMPT_HISTORY,
): string[] {
  const trimmed = entry.trim()
  if (!trimmed) return history
  if (history.length > 0 && history[history.length - 1] === trimmed) {
    return history
  }
  const next = [...history, trimmed]
  if (next.length > maxEntries) {
    return next.slice(next.length - maxEntries)
  }
  return next
}

/**
 * Index of the entry to show when moving **backwards** (older) with Up.
 * - From "not recalling" (`null`), start at the newest entry.
 * - Otherwise step one entry older, clamped at the oldest (index 0).
 * - Returns `null` when there is no history to recall.
 */
export function prevPromptIndex(
  history: string[],
  index: number | null,
): number | null {
  if (history.length === 0) return null
  if (index === null) return history.length - 1
  return Math.max(0, index - 1)
}

/**
 * Index of the entry to show when moving **forwards** (newer) with Down.
 * - Only meaningful while recalling (`index` is a number); returns `null`
 *   otherwise so the caller leaves the composer alone.
 * - Stepping past the newest entry returns `null`, signalling "exit recall and
 *   restore the draft the user started from".
 */
export function nextPromptIndex(
  history: string[],
  index: number | null,
): number | null {
  if (index === null) return null
  const next = index + 1
  if (next >= history.length) return null
  return next
}

/** The entry at a navigation index, or `null` when not recalling / out of range. */
export function promptAt(history: string[], index: number | null): string | null {
  if (index === null || index < 0 || index >= history.length) return null
  return history[index]
}

/** Read the persisted prompt history (newest last). */
export function getPromptHistory(): string[] {
  const value = storage.get<string[]>(storage.KEYS.promptHistory, [])
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/** Persist a submitted prompt, returning the updated (persisted) list. */
export function recordPrompt(entry: string): string[] {
  const next = pushPromptHistory(getPromptHistory(), entry)
  storage.set(storage.KEYS.promptHistory, next)
  return next
}
