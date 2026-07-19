/**
 * i18n mapping for action registry entries.
 *
 * Action definitions carry raw English `label`s (used as a fallback). This maps
 * each action ID to a translation key so surfaces that show actions — the
 * Settings → Shortcuts page and the command palette — render localized labels.
 *
 * Actions without an entry fall back to their raw `label`.
 */

import type { ActionId } from './definitions'

/** Map action IDs to i18n keys for translated labels. */
export const ACTION_LABEL_KEYS: Partial<Record<ActionId, string>> = {
  'app.newChat': 'shortcuts.action.newChat',
  'app.newChatInPanel': 'shortcuts.action.newChatInPanel',
  'app.settings': 'shortcuts.action.settings',
  'app.toggleTheme': 'shortcuts.action.toggleTheme',
  'app.search': 'shortcuts.action.search',
  'app.keyboardShortcuts': 'shortcuts.action.keyboardShortcuts',
  'app.newWindow': 'shortcuts.action.newWindow',
  'app.quit': 'shortcuts.action.quit',
  'nav.focusSidebar': 'shortcuts.action.focusSidebar',
  'nav.focusNavigator': 'shortcuts.action.focusNavigator',
  'nav.focusChat': 'shortcuts.action.focusChat',
  'nav.nextZone': 'shortcuts.action.focusNextZone',
  'nav.goBack': 'shortcuts.action.goBack',
  'nav.goForward': 'shortcuts.action.goForward',
  'nav.goBackAlt': 'shortcuts.action.goBack',
  'nav.goForwardAlt': 'shortcuts.action.goForward',
  'view.toggleSidebar': 'shortcuts.action.toggleSidebar',
  'view.toggleFocusMode': 'shortcuts.action.toggleFocusMode',
  'navigator.selectAll': 'shortcuts.action.selectAll',
  'navigator.clearSelection': 'shortcuts.action.clearSelection',
  'panel.focusNext': 'shortcuts.action.focusNextPanel',
  'panel.focusPrev': 'shortcuts.action.focusPrevPanel',
  'chat.stopProcessing': 'shortcuts.action.stopProcessing',
  'chat.cyclePermissionMode': 'shortcuts.action.cyclePermissionMode',
  'chat.openThinkingMenu': 'shortcuts.action.openThinkingMenu',
  'chat.nextSearchMatch': 'shortcuts.action.nextSearchMatch',
  'chat.prevSearchMatch': 'shortcuts.action.prevSearchMatch',
}

/** i18n key for a category heading (e.g. "General" → "shortcuts.category.general"). */
export function categoryLabelKey(category: string): string {
  return `shortcuts.category.${category.toLowerCase()}`
}
