/**
 * ZoomHotkeys
 *
 * Bridges the interface-zoom preference to the action registry so the standard
 * desktop zoom shortcuts (⌘+ / ⌘- / ⌘0) and their Command Palette entries drive
 * `ZoomProvider`. Renders nothing — it only registers handlers.
 *
 * Must be mounted inside both `ZoomProvider` (for `useZoom`) and
 * `ActionRegistryProvider` (for `useAction`).
 */

import { useZoom } from '@/context/ZoomContext'
import { useAction } from '@/actions'

export function ZoomHotkeys() {
  const { zoomIn, zoomOut, resetZoom } = useZoom()

  useAction('view.zoomIn', zoomIn)
  useAction('view.zoomOut', zoomOut)
  useAction('view.zoomReset', resetZoom)

  return null
}
