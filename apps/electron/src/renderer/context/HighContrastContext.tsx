/**
 * HighContrastContext
 *
 * App-wide "Increase contrast" accessibility preference — the natural companion
 * to `ReduceMotionContext`, living beside it in Settings → Appearance → Interface.
 *
 * When enabled it sets `data-high-contrast="true"` on `<html>`. The global CSS
 * block in `index.css` gated on `:root[data-high-contrast='true']` then raises
 * the contrast of the theme tokens — strengthening `--border`, `--input`,
 * `--muted-foreground`, `--foreground-dimmed` and the focus `--ring`, and adding
 * a visible focus outline. Because every theme derives those tokens from
 * `--foreground` (which flips per light/dark), the alpha-based overrides work in
 * both light and dark and across preset themes. The theme system injects its
 * colors as a `:root { … }` stylesheet rule, so the higher-specificity
 * `:root[data-high-contrast='true']` selector wins without `!important`.
 *
 * The preference is persisted in `localStorage` (renderer-only, no backend),
 * mirroring the other lightweight UI prefs in `lib/local-storage.ts`.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import * as storage from '@/lib/local-storage'

interface HighContrastContextType {
  highContrast: boolean
  setHighContrast: (value: boolean) => void
}

const HighContrastContext = createContext<HighContrastContextType | null>(null)

const HIGH_CONTRAST_ATTR = 'data-high-contrast'

/** Reflect the preference onto <html> so the global CSS overrides can react. */
function applyHighContrastAttribute(enabled: boolean): void {
  const root = document.documentElement
  if (enabled) {
    root.setAttribute(HIGH_CONTRAST_ATTR, 'true')
  } else {
    root.removeAttribute(HIGH_CONTRAST_ATTR)
  }
}

export function HighContrastProvider({ children }: { children: ReactNode }) {
  const [highContrast, setHighContrastState] = useState<boolean>(() =>
    storage.get<boolean>(storage.KEYS.highContrast, false),
  )

  // Keep the DOM attribute in sync (also covers the initial value on mount).
  useEffect(() => {
    applyHighContrastAttribute(highContrast)
  }, [highContrast])

  const setHighContrast = useCallback((value: boolean) => {
    setHighContrastState(value)
    storage.set(storage.KEYS.highContrast, value)
    applyHighContrastAttribute(value)
  }, [])

  return (
    <HighContrastContext.Provider value={{ highContrast, setHighContrast }}>
      {children}
    </HighContrastContext.Provider>
  )
}

export function useHighContrast(): HighContrastContextType {
  const ctx = useContext(HighContrastContext)
  if (!ctx) {
    throw new Error('useHighContrast must be used within a HighContrastProvider')
  }
  return ctx
}
