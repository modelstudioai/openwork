/**
 * Command-palette "recently used" history.
 *
 * A small persisted list of the action IDs most recently run from the command
 * palette, newest first. The palette surfaces these in a dedicated "Recently
 * used" group at the top so the commands you actually use are one keystroke
 * away — the standard command-palette convention (VS Code, Raycast, Linear).
 *
 * The ordering logic (`pushRecent`) is a pure function so it can be unit-tested
 * without a DOM; the read/record wrappers persist through the shared
 * localStorage helper.
 */

import { get, set, KEYS } from '@/lib/local-storage'

/** How many recent actions to remember. */
export const MAX_RECENTS = 6

/**
 * Return a new recents list with `id` moved to the front (most recent).
 *
 * Pure: no I/O. Removes any earlier occurrence of `id` (so an action never
 * appears twice), prepends it, and caps the list at `cap` entries.
 */
export function pushRecent(list: readonly string[], id: string, cap = MAX_RECENTS): string[] {
  const withoutId = list.filter((entry) => entry !== id)
  return [id, ...withoutId].slice(0, Math.max(0, cap))
}

/** Read the persisted recent action IDs (newest first). Never throws. */
export function readRecents(): string[] {
  const value = get<unknown>(KEYS.commandPaletteRecents, [])
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/** Record `id` as the most recently run action and persist the trimmed list. */
export function recordRecent(id: string): void {
  set(KEYS.commandPaletteRecents, pushRecent(readRecents(), id))
}
