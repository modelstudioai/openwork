/**
 * SettingsNavigator
 *
 * Navigator panel content for settings. Displays a list of settings sections
 * (App, Workspace, Shortcuts, Preferences) that can be selected to show in the details panel.
 * A search box at the top filters the sections by their title and description,
 * matching the searchable-settings affordance found in comparable desktop apps.
 *
 * Styling follows SessionList/SourcesListPanel patterns for visual consistency.
 */

import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal, AppWindow, Search, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@/components/ui/styled-dropdown'
import { DropdownMenuProvider } from '@/components/ui/menu-context'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import type { DetailsPageMeta } from '@/lib/navigation-registry'
import type { SettingsSubpage } from '../../../shared/types'
import { SETTINGS_ITEMS } from '../../../shared/menu-schema'
import { SETTINGS_ICONS } from '@/components/icons/SettingsIcons'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'navigator',
}

interface SettingsNavigatorProps {
  /** Currently selected settings subpage */
  selectedSubpage: SettingsSubpage
  /** Called when a subpage is selected */
  onSelectSubpage: (subpage: SettingsSubpage) => void
}

interface SettingsItem {
  id: SettingsSubpage
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

interface SettingsItemRowProps {
  item: SettingsItem
  isSelected: boolean
  isFirst: boolean
  onSelect: () => void
}

/**
 * SettingsItemRow - Individual settings item with dropdown menu
 * Tracks menu open state to keep "..." button visible when menu is open
 */
function SettingsItemRow({ item, isSelected, isFirst, onSelect }: SettingsItemRowProps) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const Icon = item.icon

  // Open settings page in a new window via deep link
  const handleOpenInNewWindow = () => {
    window.electronAPI.openUrl(`craftagents://settings/${item.id}?window=focused`)
  }

  return (
    <div
      className="settings-item"
      data-selected={isSelected || undefined}
      data-testid={`settings-nav-${item.id}`}
    >
      {/* Separator - only show if not first */}
      {!isFirst && (
        <div className="settings-separator pl-12 pr-4">
          <Separator />
        </div>
      )}
      {/* Wrapper for button with proper margins */}
      <div className="settings-content relative group select-none pl-2 mr-2">
        {/* Icon - positioned absolutely for consistent alignment */}
        <div className="absolute left-[20px] top-[14px] z-10">
          <Icon
            className={cn(
              'w-4 h-4 shrink-0',
              isSelected ? 'text-foreground' : 'text-muted-foreground'
            )}
          />
        </div>
        {/* Main content button */}
        <button
          type="button"
          onClick={onSelect}
          data-testid={`settings-item-${item.id}`}
          className={cn(
            'flex w-full items-start gap-2 pl-2 pr-4 py-3 text-left text-sm outline-none rounded-[8px]',
            // Fast hover transition (75ms vs default 150ms)
            'transition-[background-color] duration-75',
            isSelected
              ? 'bg-foreground/5 hover:bg-foreground/7'
              : 'hover:bg-foreground/2'
          )}
        >
          {/* Spacer for icon */}
          <div className="w-6 h-5 shrink-0" />
          {/* Content column */}
          <div className="flex flex-col min-w-0 flex-1">
            <span
              className={cn(
                'font-medium',
                isSelected ? 'text-foreground' : 'text-foreground/80'
              )}
            >
              {item.label}
            </span>
            <span className="text-xs text-foreground/60 line-clamp-1">
              {item.description}
            </span>
          </div>
        </button>
        {/* Action buttons - visible on hover or when menu is open */}
        <div
          className={cn(
            'absolute right-2 top-2 transition-opacity z-10',
            menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        >
          <div className="flex items-center rounded-[8px] overflow-hidden border border-transparent hover:border-border/50">
            <DropdownMenu modal={true} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <div className="p-1.5 hover:bg-foreground/10 data-[state=open]:bg-foreground/10 cursor-pointer">
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </div>
              </DropdownMenuTrigger>
              <StyledDropdownMenuContent align="end">
                <DropdownMenuProvider>
                  <StyledDropdownMenuItem onClick={handleOpenInNewWindow}>
                    <AppWindow className="h-3.5 w-3.5" />
                    <span className="flex-1">{t("sessionMenu.openInNewWindow")}</span>
                  </StyledDropdownMenuItem>
                </DropdownMenuProvider>
              </StyledDropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SettingsNavigator({
  selectedSubpage,
  onSelectSubpage,
}: SettingsNavigatorProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const settingsItems: SettingsItem[] = useMemo(() =>
    SETTINGS_ITEMS.map((item) => ({
      id: item.id,
      label: t(item.labelKey),
      icon: SETTINGS_ICONS[item.id],
      description: t(item.descriptionKey),
    })),
    [t]
  )

  const normalizedQuery = query.trim().toLowerCase()
  const filteredItems = useMemo(() => {
    if (!normalizedQuery) return settingsItems
    return settingsItems.filter((item) =>
      `${item.label} ${item.description}`.toLowerCase().includes(normalizedQuery)
    )
  }, [settingsItems, normalizedQuery])

  const hasQuery = normalizedQuery.length > 0

  return (
    <div className="flex flex-col h-full" data-testid="settings-navigator">
      {/* Search box — filters sections by title + description */}
      <div className="shrink-0 px-2 pt-2 pb-1.5 border-b border-border/50">
        <div className="relative rounded-[8px] shadow-minimal bg-muted/50 has-[:focus-visible]:bg-background">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            role="searchbox"
            aria-label={t('common.search')}
            data-testid="settings-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.preventDefault()
                e.stopPropagation()
                setQuery('')
              }
            }}
            placeholder={t('common.search')}
            className="w-full h-8 pl-8 pr-8 text-sm bg-transparent border-0 rounded-[8px] outline-none focus-visible:ring-0 focus-visible:outline-none placeholder:text-muted-foreground/50"
          />
          {hasQuery && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-foreground/10 rounded"
              title={t('common.clear')}
              aria-label={t('common.clear')}
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredItems.length > 0 ? (
          <div className="pt-2">
            {filteredItems.map((item, index) => (
              <SettingsItemRow
                key={item.id}
                item={item}
                isSelected={selectedSubpage === item.id}
                isFirst={index === 0}
                onSelect={() => onSelectSubpage(item.id)}
              />
            ))}
          </div>
        ) : (
          <div
            data-testid="settings-search-empty"
            className="px-4 py-8 text-center text-sm text-muted-foreground"
          >
            {t('common.noResultsFound')}
          </div>
        )}
      </div>
    </div>
  )
}
