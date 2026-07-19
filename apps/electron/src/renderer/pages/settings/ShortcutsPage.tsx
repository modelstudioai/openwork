/**
 * ShortcutsPage
 *
 * Displays keyboard shortcuts reference from the centralized action registry.
 *
 * A search box at the top filters the shortcuts by their action label and their
 * key combination (so typing either "theme" or "shift" narrows the list),
 * matching the searchable keyboard-shortcut affordance found in comparable
 * desktop apps (Codex's "keypress search", VS Code / Claude keybindings).
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SettingsSection, SettingsCard, SettingsRow } from '@/components/settings'
import type { DetailsPageMeta } from '@/lib/navigation-registry'
import { isMac } from '@/lib/platform'
import {
  actionsByCategory,
  useActionRegistry,
  ACTION_LABEL_KEYS,
  type ActionId,
} from '@/actions'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'shortcuts',
}

interface ShortcutRow {
  /** Stable key for React. */
  key: string
  /** Visible label for the shortcut. */
  label: string
  /** Individual keys to render as <kbd> chips. */
  keys: string[]
}

interface ShortcutSection {
  key: string
  title: string
  rows: ShortcutRow[]
}

/** Split a display hotkey (e.g. "⌘⇧N" on Mac, "Ctrl+Shift+N" elsewhere) into keys. */
function splitHotkey(hotkey: string): string[] {
  return isMac ? hotkey.match(/[⌘⇧⌥←→]|Tab|Esc|./g) || [] : hotkey.split('+')
}

/** Lowercased haystack for a row: its label plus every key token. */
function rowHaystack(row: ShortcutRow): string {
  return `${row.label} ${row.keys.join(' ')}`.toLowerCase()
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-medium font-sans bg-muted border border-border rounded">
      {children}
    </kbd>
  )
}

export default function ShortcutsPage() {
  const { t } = useTranslation()
  const { getAction, getHotkeyDisplay } = useActionRegistry()
  const [query, setQuery] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Build the full, flat section model up front so we can filter it purely.
  // Registry-driven sections come from actionsByCategory; hotkey-less actions
  // are omitted (they have no shortcut to show), matching prior behaviour.
  const sections = React.useMemo<ShortcutSection[]>(() => {
    const registrySections: ShortcutSection[] = Object.entries(actionsByCategory).map(
      ([category, categoryActions]) => {
        const rows: ShortcutRow[] = []
        for (const action of categoryActions) {
          const actionId = action.id as ActionId
          const hotkey = getHotkeyDisplay(actionId)
          if (!hotkey) continue
          const labelKey = ACTION_LABEL_KEYS[actionId]
          const label = labelKey ? t(labelKey) : getAction(actionId).label
          rows.push({ key: actionId, label, keys: splitHotkey(hotkey) })
        }
        return {
          key: `category-${category}`,
          title: t(`shortcuts.category.${category.toLowerCase()}`),
          rows,
        }
      },
    )

    // Component-specific shortcuts that aren't in the centralized registry.
    const componentSections: ShortcutSection[] = [
      {
        key: 'listNavigation',
        title: t('shortcuts.listNavigation'),
        rows: [
          { key: 'navigateItems', label: t('shortcuts.navigateItems'), keys: ['↑', '↓'] },
          { key: 'goToFirst', label: t('shortcuts.goToFirst'), keys: ['Home'] },
          { key: 'goToLast', label: t('shortcuts.goToLast'), keys: ['End'] },
        ],
      },
      {
        key: 'sessionList',
        title: t('shortcuts.sessionList'),
        rows: [
          { key: 'focusChatInput', label: t('shortcuts.focusChatInput'), keys: ['Enter'] },
          { key: 'openContextMenu', label: t('shortcuts.openContextMenu'), keys: ['Right-click'] },
          {
            key: 'addFilterExcluded',
            label: t('shortcuts.addFilterExcluded'),
            keys: [isMac ? '⌥' : 'Alt', 'Click'],
          },
        ],
      },
      {
        key: 'chatInput',
        title: t('shortcuts.chatInput'),
        rows: [
          { key: 'sendMessage', label: t('shortcuts.sendMessage'), keys: ['Enter'] },
          { key: 'newLine', label: t('shortcuts.newLine'), keys: ['Shift', 'Enter'] },
          { key: 'closeDialogBlur', label: t('shortcuts.closeDialogBlur'), keys: ['Esc'] },
        ],
      },
    ]

    return [...registrySections, ...componentSections].filter((s) => s.rows.length > 0)
  }, [t, getAction, getHotkeyDisplay])

  // Filter rows by label + key tokens; drop sections that end up empty.
  const trimmedQuery = query.trim().toLowerCase()
  const filteredSections = React.useMemo<ShortcutSection[]>(() => {
    if (!trimmedQuery) return sections
    return sections
      .map((section) => ({
        ...section,
        rows: section.rows.filter((row) => rowHaystack(row).includes(trimmedQuery)),
      }))
      .filter((section) => section.rows.length > 0)
  }, [sections, trimmedQuery])

  const hasResults = filteredSections.length > 0

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t('settings.shortcuts.title')} />
      {/* Search box — filters shortcuts by action label + key combination */}
      <div className="shrink-0 px-5 pt-4 max-w-3xl mx-auto w-full">
        <div className="relative rounded-[8px] shadow-minimal bg-muted/50 has-[:focus-visible]:bg-background">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            role="searchbox"
            aria-label={t('common.search')}
            data-testid="shortcuts-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.stopPropagation()
                setQuery('')
              }
            }}
            placeholder={t('common.search')}
            className="w-full h-8 pl-8 pr-8 text-sm bg-transparent border-0 rounded-[8px] outline-none focus-visible:ring-0 focus-visible:outline-none placeholder:text-muted-foreground/50"
          />
          {query && (
            <button
              type="button"
              aria-label={t('common.clear')}
              data-testid="shortcuts-search-clear"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-foreground/10"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto space-y-8">
            {hasResults ? (
              filteredSections.map((section) => (
                <SettingsSection key={section.key} title={section.title}>
                  <SettingsCard>
                    {section.rows.map((row) => (
                      <SettingsRow key={row.key} label={row.label}>
                        <div className="flex items-center gap-1">
                          {row.keys.map((key, keyIndex) => (
                            <Kbd key={keyIndex}>{key}</Kbd>
                          ))}
                        </div>
                      </SettingsRow>
                    ))}
                  </SettingsCard>
                </SettingsSection>
              ))
            ) : (
              <div
                data-testid="shortcuts-search-empty"
                className="px-4 py-8 text-center text-sm text-muted-foreground"
              >
                {t('common.noResultsFound')}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
