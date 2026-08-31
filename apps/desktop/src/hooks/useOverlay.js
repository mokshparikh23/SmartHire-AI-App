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
// REDESIGN 2026-08-29: the new chrome puts a shortcut chip on nearly every
// control, so the guard can no longer require Shift — Answer is ⌘↵, Clear
// answer is ⌘⌫, and the pager is ⌘←/⌘→. Each branch checks its own modifiers.
//
// The reference design shows Chat on ⌘⇧⌫, which is also its transcript Clear.
// Chat is ⌘⇧J here so the two do not collide.
// export function usePanelHotkeys({ onType, onStop, onCopy, onRetry }) {
export function usePanelHotkeys({
  onType, onStop, onCopy, onRetry,
  onAnswer, onScreenshot, onChat, onClearTranscript, onClearAnswer, onPrev, onNext,
}) {
  useEffect(() => {
    const onKeyDown = (e) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      // ⌘← / ⌘→ mean line-start / line-end inside a text field, and ⌘⌫ means
      // delete-to-start. Never steal those from an input the user is typing in.
      const el = e.target
      const typing = el instanceof HTMLElement &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

      const key = e.key.toLowerCase()

      if (e.shiftKey) {
        /* PREMIUM-UX 2026-08-31 ─ the typing guard was never applied here ──────
           `typing` is computed above for every branch, but only the non-shift
           branch below consulted it. So every ⌘⇧ chord fired while the user was
           typing in the chat composer or the transcript input — including
           ⌘⇧⌫, which wipes the transcript, and ⌘⇧X, which ENDS THE BILLED
           SESSION with no confirmation and no label anywhere in the UI.

           Only the two destructive chords are guarded. Copy, Retry, Chat,
           Screenshot and Type are all safe to fire mid-typing and are useful
           there — guarding them too would be a different, smaller bug. */
        if (typing && (key === 'x' || key === 'backspace')) return

        if (key === 'k')          { e.preventDefault(); onType?.() }
        else if (key === 'x')     { e.preventDefault(); onStop?.() }
        else if (key === 'c')     { e.preventDefault(); onCopy?.() }
        else if (key === 'r')     { e.preventDefault(); onRetry?.() }
        else if (key === 'j')     { e.preventDefault(); onChat?.() }
        else if (key === 'enter') { e.preventDefault(); onScreenshot?.() }
        else if (key === 'backspace') { e.preventDefault(); onClearTranscript?.() }
        return
      }

      if (key === 'enter')          { e.preventDefault(); onAnswer?.() }
      else if (key === 'backspace') { if (!typing) { e.preventDefault(); onClearAnswer?.() } }
      else if (key === 'arrowleft') { if (!typing) { e.preventDefault(); onPrev?.() } }
      else if (key === 'arrowright'){ if (!typing) { e.preventDefault(); onNext?.() } }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    onType, onStop, onCopy, onRetry,
    onAnswer, onScreenshot, onChat, onClearTranscript, onClearAnswer, onPrev, onNext,
  ])
}
