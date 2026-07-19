import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@craft-agent/ui'
import { computeComposerCounts, shouldShowComposerCount } from '@/lib/composer-count'

export interface ComposerCountIndicatorProps {
  /** Current plain-text draft in the composer. */
  text: string
}

/**
 * ComposerCountIndicator — a subtle live word/character/line count for the
 * composer draft.
 *
 * Renders `null` for an empty/whitespace-only draft so the empty composer stays
 * clean. Shows the word count inline; the full breakdown (words / characters /
 * lines) is in the hover tooltip. All values are exposed as `data-*` attributes
 * for e2e assertions.
 */
export function ComposerCountIndicator({ text }: ComposerCountIndicatorProps) {
  const { t } = useTranslation()

  const counts = React.useMemo(() => computeComposerCounts(text), [text])

  if (!shouldShowComposerCount(text)) return null

  const wordsLabel = t('chat.composerWords', { count: counts.words })
  const charactersLabel = t('chat.composerCharacters', { count: counts.characters })
  const linesLabel = t('chat.composerLines', { count: counts.lines })

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-testid="composer-count"
          data-word-count={counts.words}
          data-char-count={counts.characters}
          data-line-count={counts.lines}
          aria-label={`${wordsLabel}, ${charactersLabel}, ${linesLabel}`}
          className="select-none tabular-nums text-[12px] text-muted-foreground px-1.5 shrink-0 whitespace-nowrap"
        >
          {wordsLabel}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="flex flex-col gap-0.5 text-[12px] tabular-nums">
          <span>{wordsLabel}</span>
          <span>{charactersLabel}</span>
          <span>{linesLabel}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
