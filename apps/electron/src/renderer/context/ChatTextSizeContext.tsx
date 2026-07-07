/**
 * ChatTextSizeContext
 *
 * App-wide "Chat text size" preference — scales the typography of the
 * conversation transcript without resizing the rest of the app.
 *
 * Unlike the OS-level window zoom wired to the View menu
 * (`webContents.setZoomFactor`), which scales the entire UI (sidebar, toolbar,
 * composer, icons, spacing), this preference only affects the reading text in
 * chat. It works by reflecting the choice onto `<html>` as
 * `data-chat-text-size="small|medium|large"`; the global CSS in `index.css`
 * maps that to a `--chat-font-scale` custom property, which the chat transcript
 * container (`.chat-text-scope` in `ChatDisplay`) consumes via
 * `font-size: calc(1em * var(--chat-font-scale))`. Because the scale is
 * `em`-relative it is exactly neutral at `medium` (1×) and scales the inherited
 * message text up/down at `small` (0.9×) / `large` (1.15×).
 *
 * The preference is persisted in `localStorage` (renderer-only, no backend),
 * mirroring the other lightweight UI prefs in `lib/local-storage.ts` and the
 * sibling `ReduceMotionContext`.
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

export type ChatTextSize = 'small' | 'medium' | 'large'

const CHAT_TEXT_SIZES: readonly ChatTextSize[] = ['small', 'medium', 'large']

const DEFAULT_CHAT_TEXT_SIZE: ChatTextSize = 'medium'

interface ChatTextSizeContextType {
  chatTextSize: ChatTextSize
  setChatTextSize: (value: ChatTextSize) => void
}

const ChatTextSizeContext = createContext<ChatTextSizeContextType | null>(null)

const CHAT_TEXT_SIZE_ATTR = 'data-chat-text-size'

/** Guard against malformed persisted values. */
function normalize(value: unknown): ChatTextSize {
  return CHAT_TEXT_SIZES.includes(value as ChatTextSize)
    ? (value as ChatTextSize)
    : DEFAULT_CHAT_TEXT_SIZE
}

/** Reflect the preference onto <html> so the global CSS var can react. */
function applyChatTextSizeAttribute(size: ChatTextSize): void {
  document.documentElement.setAttribute(CHAT_TEXT_SIZE_ATTR, size)
}

export function ChatTextSizeProvider({ children }: { children: ReactNode }) {
  const [chatTextSize, setChatTextSizeState] = useState<ChatTextSize>(() =>
    normalize(storage.get<ChatTextSize>(storage.KEYS.chatTextSize, DEFAULT_CHAT_TEXT_SIZE)),
  )

  // Keep the DOM attribute in sync (also covers the initial value on mount).
  useEffect(() => {
    applyChatTextSizeAttribute(chatTextSize)
  }, [chatTextSize])

  const setChatTextSize = useCallback((value: ChatTextSize) => {
    const next = normalize(value)
    setChatTextSizeState(next)
    storage.set(storage.KEYS.chatTextSize, next)
    applyChatTextSizeAttribute(next)
  }, [])

  return (
    <ChatTextSizeContext.Provider value={{ chatTextSize, setChatTextSize }}>
      {children}
    </ChatTextSizeContext.Provider>
  )
}

export function useChatTextSize(): ChatTextSizeContextType {
  const ctx = useContext(ChatTextSizeContext)
  if (!ctx) {
    throw new Error('useChatTextSize must be used within a ChatTextSizeProvider')
  }
  return ctx
}
