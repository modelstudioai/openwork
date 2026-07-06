/**
 * ReduceMotionContext
 *
 * App-wide "Reduce motion" accessibility preference.
 *
 * When enabled it:
 *  - renders the app inside `<MotionConfig reducedMotion="always">` so every
 *    `motion/react` component short-circuits its animations (MotionConfig
 *    propagates through React context to all `motion` components in the tree,
 *    including those in `packages/ui`);
 *  - sets `data-reduce-motion="true"` on `<html>` so the global CSS guard in
 *    `index.css` can collapse plain CSS animations/transitions too.
 *
 * When disabled it uses `reducedMotion="user"`, which still honors the OS
 * `prefers-reduced-motion` setting — a better default than always animating.
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
import { MotionConfig } from 'motion/react'
import * as storage from '@/lib/local-storage'

interface ReduceMotionContextType {
  reduceMotion: boolean
  setReduceMotion: (value: boolean) => void
}

const ReduceMotionContext = createContext<ReduceMotionContextType | null>(null)

const REDUCE_MOTION_ATTR = 'data-reduce-motion'

/** Reflect the preference onto <html> so the global CSS guard can react. */
function applyReduceMotionAttribute(enabled: boolean): void {
  const root = document.documentElement
  if (enabled) {
    root.setAttribute(REDUCE_MOTION_ATTR, 'true')
  } else {
    root.removeAttribute(REDUCE_MOTION_ATTR)
  }
}

export function ReduceMotionProvider({ children }: { children: ReactNode }) {
  const [reduceMotion, setReduceMotionState] = useState<boolean>(() =>
    storage.get<boolean>(storage.KEYS.reduceMotion, false),
  )

  // Keep the DOM attribute in sync (also covers the initial value on mount).
  useEffect(() => {
    applyReduceMotionAttribute(reduceMotion)
  }, [reduceMotion])

  const setReduceMotion = useCallback((value: boolean) => {
    setReduceMotionState(value)
    storage.set(storage.KEYS.reduceMotion, value)
    applyReduceMotionAttribute(value)
  }, [])

  return (
    <ReduceMotionContext.Provider value={{ reduceMotion, setReduceMotion }}>
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
        {children}
      </MotionConfig>
    </ReduceMotionContext.Provider>
  )
}

export function useReduceMotion(): ReduceMotionContextType {
  const ctx = useContext(ReduceMotionContext)
  if (!ctx) {
    throw new Error('useReduceMotion must be used within a ReduceMotionProvider')
  }
  return ctx
}
