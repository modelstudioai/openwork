/**
 * CommandPalette
 *
 * A global, keyboard-driven overlay (⌘K / Ctrl+K) to search for and run any
 * registered app action — the "run surface" that pairs with the read-only
 * Keyboard Shortcuts reference.
 *
 * Fully frontend-only: it lists the centralized action registry, filters with
 * cmdk's built-in fuzzy match, and dispatches the chosen action through the
 * registry's `execute()` — exactly as if the action's hotkey had been pressed.
 *
 * Self-contained: it registers its own open handler (`app.commandPalette`),
 * owns its open state, and integrates with the modal stack for layered close.
 */

import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from '@/components/ui/command'
import { useRegisterModal } from '@/context/ModalContext'
import {
  useAction,
  useActionRegistry,
  actions as actionDefinitions,
  actionsByCategory,
  ACTION_LABEL_KEYS,
  categoryLabelKey,
  type ActionId,
} from '@/actions'
import { readRecents, recordRecent } from './command-palette-recents'

// Actions that should not appear as palette entries:
//  - the palette's own open action (running it from inside the palette is a no-op)
//  - the arrow-key alternates of Go Back / Go Forward (duplicate labels; the
//    primary bracket-key actions already represent them)
const EXCLUDED_ACTIONS = new Set<ActionId>([
  'app.commandPalette',
  'nav.goBackAlt',
  'nav.goForwardAlt',
])

export function CommandPalette() {
  const { t } = useTranslation()
  const { execute, canExecute, getHotkeyDisplay } = useActionRegistry()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // ⌘K / Ctrl+K toggles the palette.
  useAction('app.commandPalette', () => setOpen(prev => !prev))

  // Reset the query each time the palette opens so it always starts fresh
  // (and the "Recently used" group — shown only for an empty query — is visible).
  const handleOpenChange = useCallback((next: boolean) => {
    if (next) setSearch('')
    setOpen(next)
  }, [])

  // Participate in the layered modal stack (Cmd+W / X close the topmost modal).
  const handleClose = useCallback(() => setOpen(false), [])
  useRegisterModal(open, handleClose)

  // Turn a runnable action id into a display-ready palette entry.
  const toItem = useCallback(
    (id: ActionId) => {
      const labelKey = ACTION_LABEL_KEYS[id]
      return {
        id,
        label: labelKey ? t(labelKey) : actionDefinitions[id].label,
        hotkey: getHotkeyDisplay(id),
      }
    },
    [t, getHotkeyDisplay],
  )

  // Build the grouped, display-ready action list once.
  const groups = useMemo(() => {
    return Object.entries(actionsByCategory)
      .map(([category, actions]) => ({
        category,
        heading: t(categoryLabelKey(category)),
        items: actions
          .filter(action => !EXCLUDED_ACTIONS.has(action.id as ActionId))
          // Only list actions that can actually run right now — hide
          // context-scoped ones (e.g. navigator/search actions) whose handler
          // is disabled, so the palette never shows a dead entry. Evaluated as
          // the palette opens, i.e. against the focus you're returning to.
          .filter(action => canExecute(action.id as ActionId))
          .map(action => toItem(action.id as ActionId)),
      }))
      .filter(group => group.items.length > 0)
    // getHotkeyDisplay / t are stable enough for a menu; recompute on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // "Recently used": the most-recently-run actions, newest first. Kept to
  // entries that still exist, aren't excluded from the palette, and can run
  // right now — so the group never surfaces a stale or dead command. Only
  // shown for an empty query (a search should rank by relevance, not recency).
  const recentItems = useMemo(() => {
    return readRecents()
      .filter((id): id is ActionId => id in actionDefinitions)
      .filter(id => !EXCLUDED_ACTIONS.has(id))
      .filter(id => canExecute(id))
      .map(id => toItem(id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const showRecent = search.trim() === '' && recentItems.length > 0

  const runAction = useCallback(
    (id: ActionId) => {
      // Remember this action so it surfaces in "Recently used" next time.
      recordRecent(id)
      // Close first, then run on the next tick. Closing the dialog restores
      // focus to the element that was active before the palette opened, so the
      // action runs in the app's real focus context — actions that open a panel
      // or move focus (e.g. Search) would otherwise fire mid-teardown and get
      // clobbered by the dialog's focus restoration.
      setOpen(false)
      setTimeout(() => execute(id), 0)
    },
    [execute],
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="overflow-hidden p-0"
        data-testid="command-palette"
        aria-label={t('commands.title')}
      >
        <DialogTitle className="sr-only">{t('commands.title')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('commands.searchCommands')}
        </DialogDescription>
        <Command
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
        >
          <CommandInput
            data-testid="command-palette-input"
            placeholder={t('commands.searchCommands')}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty data-testid="command-palette-empty">
              {t('common.noResultsFound')}
            </CommandEmpty>
            {showRecent && (
              <CommandGroup heading={t('commands.recent')}>
                {recentItems.map(item => (
                  <CommandItem
                    key={`recent:${item.id}`}
                    value={`recent ${item.label} ${item.id}`}
                    data-testid="command-palette-recent-item"
                    onSelect={() => runAction(item.id)}
                  >
                    <span>{item.label}</span>
                    {item.hotkey && (
                      <CommandShortcut>{item.hotkey}</CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {groups.map(group => (
              <CommandGroup key={group.category} heading={group.heading}>
                {group.items.map(item => (
                  <CommandItem
                    key={item.id}
                    value={`${item.label} ${item.id}`}
                    data-testid="command-palette-item"
                    onSelect={() => runAction(item.id)}
                  >
                    <span>{item.label}</span>
                    {item.hotkey && (
                      <CommandShortcut>{item.hotkey}</CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
