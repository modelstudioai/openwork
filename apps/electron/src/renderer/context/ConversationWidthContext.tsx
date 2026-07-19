/**
 * ConversationWidthContext
 *
 * App-wide "Conversation width" preference — controls the reading-column width
 * of the chat transcript and composer, mirroring the width controls in
 * comparable desktop clients (Claude Desktop, ChatGPT desktop, Codex / VS Code).
 *
 * Three modes:
 *  - `comfortable` (default) — the classic ~840px reading column;
 *  - `wide` — a roomier 1100px column for code-heavy conversations;
 *  - `full` — no max-width, uses the full available panel width.
 *
 * When applied it:
 *  - sets `data-conversation-width="<mode>"` on `<html>` (for CSS hooks + tests);
 *  - drives a CSS custom property `--chat-content-max-width` on `<html>`
 *    (`840px` / `1100px` / `none`). The transcript container and composer read
 *    it via `max-width: var(--chat-content-max-width, 840px)`, so the fallback
 *    keeps the shared web viewer (`packages/ui`) unchanged at 840px.
 *
 * The preference is persisted in `localStorage` (renderer-only, no backend),
 * mirroring the other lightweight UI prefs in `lib/local-storage.ts`.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import * as storage from '@/lib/local-storage'

export type ConversationWidth = 'comfortable' | 'wide' | 'full'

/** Resolved CSS `max-width` value for each mode. */
const MAX_WIDTH_BY_MODE: Record<ConversationWidth, string> = {
  comfortable: '840px',
  wide: '1100px',
  full: 'none',
}

const CONVERSATION_WIDTH_ATTR = 'data-conversation-width'
const MAX_WIDTH_VAR = '--chat-content-max-width'

const DEFAULT_WIDTH: ConversationWidth = 'comfortable'

function isConversationWidth(value: unknown): value is ConversationWidth {
  return value === 'comfortable' || value === 'wide' || value === 'full'
}

interface ConversationWidthContextType {
  conversationWidth: ConversationWidth
  setConversationWidth: (value: ConversationWidth) => void
}

const ConversationWidthContext = createContext<ConversationWidthContextType | null>(null)

/** Reflect the preference onto <html> so CSS + the transcript/composer can react. */
function applyConversationWidth(mode: ConversationWidth): void {
  const root = document.documentElement
  root.setAttribute(CONVERSATION_WIDTH_ATTR, mode)
  root.style.setProperty(MAX_WIDTH_VAR, MAX_WIDTH_BY_MODE[mode])
}

export function ConversationWidthProvider({ children }: { children: ReactNode }) {
  const [conversationWidth, setConversationWidthState] = useState<ConversationWidth>(() => {
    const stored = storage.get<ConversationWidth>(storage.KEYS.conversationWidth, DEFAULT_WIDTH)
    return isConversationWidth(stored) ? stored : DEFAULT_WIDTH
  })

  // Keep the DOM in sync (also covers the initial value on mount).
  useEffect(() => {
    applyConversationWidth(conversationWidth)
  }, [conversationWidth])

  const setConversationWidth = useCallback((value: ConversationWidth) => {
    setConversationWidthState(value)
    storage.set(storage.KEYS.conversationWidth, value)
    applyConversationWidth(value)
  }, [])

  return (
    <ConversationWidthContext.Provider value={{ conversationWidth, setConversationWidth }}>
      {children}
    </ConversationWidthContext.Provider>
  )
}

export function useConversationWidth(): ConversationWidthContextType {
  const ctx = useContext(ConversationWidthContext)
  if (!ctx) {
    throw new Error('useConversationWidth must be used within a ConversationWidthProvider')
  }
  return ctx
}
