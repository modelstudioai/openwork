import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, Hammer, Bug, FlaskConical, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Starter prompt suggestions shown on the empty conversation state, beneath the
 * centered composer. Mirrors the "prompt suggestions" surface in Claude Code
 * Desktop / ChatGPT / Codex: a few clickable starting points that populate the
 * composer (they do NOT auto-send, so the user can edit before submitting).
 *
 * Each suggestion pairs a short, localized label with a fuller prompt. Clicking
 * one calls `onSelect(prompt)` — the parent seeds the (controlled) composer via
 * the same draft channel used elsewhere, then focuses the input.
 */

interface SuggestionDef {
  /** Stable id → i18n keys `chat.suggestions.<id>.title` / `.prompt`. */
  id: string
  icon: LucideIcon
}

/** The fixed set of starter suggestions. Order here is the render order. */
const SUGGESTIONS: readonly SuggestionDef[] = [
  { id: 'explain', icon: BookOpen },
  { id: 'build', icon: Hammer },
  { id: 'fix', icon: Bug },
  { id: 'tests', icon: FlaskConical },
] as const

export interface EmptyStateSuggestionsProps {
  /** Called with the full prompt text when a suggestion is chosen. */
  onSelect: (prompt: string) => void
  /** Hide the surface entirely (e.g. no connection / input disabled). */
  disabled?: boolean
  className?: string
}

export function EmptyStateSuggestions({
  onSelect,
  disabled = false,
  className,
}: EmptyStateSuggestionsProps) {
  const { t } = useTranslation()

  if (disabled) return null

  return (
    <div
      data-testid="empty-suggestions"
      className={cn(
        'mx-auto mt-4 grid w-full max-w-[840px] grid-cols-1 gap-2 sm:grid-cols-2',
        className,
      )}
    >
      {SUGGESTIONS.map(({ id, icon: Icon }) => {
        const title = t(`chat.suggestions.${id}.title`)
        const prompt = t(`chat.suggestions.${id}.prompt`)
        return (
          <button
            key={id}
            type="button"
            data-testid="empty-suggestion"
            data-suggestion-id={id}
            onClick={() => onSelect(prompt)}
            className={cn(
              'group flex items-center gap-2.5 rounded-[10px] border bg-muted/20 px-3.5 py-2.5 text-left',
              'text-sm text-foreground/80 transition-colors',
              'hover:bg-muted/50 hover:text-foreground',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            )}
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
            <span className="min-w-0 truncate font-medium">{title}</span>
          </button>
        )
      })}
    </div>
  )
}
