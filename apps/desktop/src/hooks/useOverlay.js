import { useEffect } from 'react'

/**
 * Window concerns for the floating panel. No audio, no AI — those belong to
 * useInterviewSession.
 *
 * Note there is no click-through hook here, and deliberately so: the main
 * process sizes the window to exactly the panel while a session runs, so there
 * is no window outside the panel to swallow a click. That removes the whole
 * class of setIgnoreMouseEvents problems — corner flicker, clicks leaking
 * through on a fast approach, and the window bricking itself if the renderer
 * reloads while input is being ignored.
 */

/** Keeps the panel's translucency in step with the Settings slider. */
export function usePanelOpacity(panelRef, overlayOpacity) {
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    // Clamped: fully opaque stops reading as glass, too sheer is unreadable.
    const alpha = Math.min(0.95, Math.max(0.55, (overlayOpacity ?? 90) / 100))
    el.style.setProperty('--ia-alpha', alpha.toFixed(3))
  }, [panelRef, overlayOpacity])
}

/**
 * Panel-local keyboard shortcuts. Renderer-scoped on purpose — a global
 * shortcut would have to focus the window first, which defeats the point.
 */
export function usePanelHotkeys({ onType, onStop, onCopy, onRetry }) {
  useEffect(() => {
    const onKeyDown = (e) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod || !e.shiftKey) return

      const key = e.key.toLowerCase()
      if (key === 'k')      { e.preventDefault(); onType?.() }
      else if (key === 'x') { e.preventDefault(); onStop?.() }
      else if (key === 'c') { e.preventDefault(); onCopy?.() }
      else if (key === 'r') { e.preventDefault(); onRetry?.() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onType, onStop, onCopy, onRetry])
}
