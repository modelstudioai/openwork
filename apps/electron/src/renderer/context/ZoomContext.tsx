/**
 * ZoomContext
 *
 * App-wide "interface zoom" preference — scales the whole renderer (sidebar,
 * navigator, chat, settings, dialogs) up or down, like the ⌘+ / ⌘- / ⌘0 zoom
 * in Claude Desktop, VS Code, and other desktop apps.
 *
 * The zoom factor is one of a fixed set of Chrome-like steps and is applied by
 * setting `document.documentElement.style.zoom` — a Chromium-native property
 * that scales the entire tree, including portalled dialogs rendered into
 * `<body>`. At 100% the inline style is cleared so the DOM stays clean.
 *
 * The preference is persisted in `localStorage` (renderer-only, no backend),
 * mirroring the other lightweight UI prefs in `lib/local-storage.ts` and the
 * merged `ReduceMotionProvider`.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import * as storage from '@/lib/local-storage'

/** Discrete zoom steps (factors), mirroring a browser's zoom ladder. */
export const ZOOM_STEPS: readonly number[] = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]

/** The neutral / "actual size" factor. */
export const DEFAULT_ZOOM = 1

interface ZoomContextType {
  /** Current zoom factor (e.g. 1 = 100%, 1.1 = 110%). */
  zoom: number
  /** Whole-number percentage for display (e.g. 110). */
  zoomPercent: number
  /** Step up to the next larger factor (no-op at the max). */
  zoomIn: () => void
  /** Step down to the next smaller factor (no-op at the min). */
  zoomOut: () => void
  /** Return to 100%. */
  resetZoom: () => void
  /** Whether a larger step is available. */
  canZoomIn: boolean
  /** Whether a smaller step is available. */
  canZoomOut: boolean
}

const ZoomContext = createContext<ZoomContextType | null>(null)

/** Clamp an arbitrary stored value onto the nearest valid step. */
function normalizeZoom(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ZOOM
  let nearest = ZOOM_STEPS[0]
  let bestDelta = Math.abs(value - nearest)
  for (const step of ZOOM_STEPS) {
    const delta = Math.abs(value - step)
    if (delta < bestDelta) {
      nearest = step
      bestDelta = delta
    }
  }
  return nearest
}

/** Reflect the factor onto <html> so the whole renderer scales. */
function applyZoom(factor: number): void {
  const root = document.documentElement
  if (factor === DEFAULT_ZOOM) {
    root.style.removeProperty('zoom')
  } else {
    root.style.zoom = String(factor)
  }
}

export function ZoomProvider({ children }: { children: ReactNode }) {
  const [zoom, setZoomState] = useState<number>(() =>
    normalizeZoom(storage.get<number>(storage.KEYS.zoomLevel, DEFAULT_ZOOM)),
  )

  // Keep the DOM in sync (also covers the initial value on mount).
  useEffect(() => {
    applyZoom(zoom)
  }, [zoom])

  const setZoom = useCallback((factor: number) => {
    const next = normalizeZoom(factor)
    setZoomState(next)
    storage.set(storage.KEYS.zoomLevel, next)
    applyZoom(next)
  }, [])

  const zoomIn = useCallback(() => {
    setZoomState((current) => {
      const idx = ZOOM_STEPS.indexOf(normalizeZoom(current))
      const next = ZOOM_STEPS[Math.min(idx + 1, ZOOM_STEPS.length - 1)]
      storage.set(storage.KEYS.zoomLevel, next)
      applyZoom(next)
      return next
    })
  }, [])

  const zoomOut = useCallback(() => {
    setZoomState((current) => {
      const idx = ZOOM_STEPS.indexOf(normalizeZoom(current))
      const next = ZOOM_STEPS[Math.max(idx - 1, 0)]
      storage.set(storage.KEYS.zoomLevel, next)
      applyZoom(next)
      return next
    })
  }, [])

  const resetZoom = useCallback(() => setZoom(DEFAULT_ZOOM), [setZoom])

  const value = useMemo<ZoomContextType>(() => {
    const idx = ZOOM_STEPS.indexOf(zoom)
    return {
      zoom,
      zoomPercent: Math.round(zoom * 100),
      zoomIn,
      zoomOut,
      resetZoom,
      canZoomIn: idx < ZOOM_STEPS.length - 1,
      canZoomOut: idx > 0,
    }
  }, [zoom, zoomIn, zoomOut, resetZoom])

  return <ZoomContext.Provider value={value}>{children}</ZoomContext.Provider>
}

export function useZoom(): ZoomContextType {
  const ctx = useContext(ZoomContext)
  if (!ctx) {
    throw new Error('useZoom must be used within a ZoomProvider')
  }
  return ctx
}
