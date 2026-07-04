/**
 * Cross-component bridge for opening a composer toolbar menu from a global
 * keyboard shortcut.
 *
 * The action registry lives at the app shell (it owns the global hotkey
 * listener), while the composer's toolbar dropdowns (thinking / model) own
 * their controlled `open` state inside `FreeFormInput`. This event lets the
 * shell ask the focused composer to open one of its menus, mirroring the
 * scoping model of `focus-input-events.ts` so multi-panel layouts target the
 * right composer.
 */

/** Composer toolbar menus that can be opened via a shortcut. */
export type ComposerMenu = 'thinking'

export interface ComposerMenuEventDetail {
  /** Restrict to a specific session's composer; omit to target the focused panel. */
  sessionId?: string
  menu: ComposerMenu
}

export const COMPOSER_MENU_EVENT = 'craft:open-composer-menu'

/**
 * Ask a composer to open one of its toolbar menus. With no `sessionId`, the
 * focused panel's composer handles it (see `shouldHandleScopedInputEvent`).
 */
export function dispatchOpenComposerMenuEvent(detail: ComposerMenuEventDetail): void {
  window.dispatchEvent(
    new CustomEvent<ComposerMenuEventDetail>(COMPOSER_MENU_EVENT, { detail }),
  )
}
