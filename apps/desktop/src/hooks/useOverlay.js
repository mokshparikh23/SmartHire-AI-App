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
// PIPELINE 2026-08-31: onStopGenerating added. `onStop` is the SESSION — it
// closes the metered row and dismisses the panel. There was nothing at all that
// stopped only the answer, so a runaway generation could only be waited out.
// export function usePanelHotkeys({ onType, onStop, onCopy, onRetry, … }) {
// PREMIUM-UX 2026-08-31: onFocus (⌘⇧F) and onEscape added.
export function usePanelHotkeys({
  onType, onStop, onCopy, onRetry, onStopGenerating, onFocus, onEscape,
  onAnswer, onScreenshot, onChat, onClearTranscript, onClearAnswer, onPrev, onNext,
}) {
  useEffect(() => {
    const onKeyDown = (e) => {
      const mod = e.metaKey || e.ctrlKey

      // ⌘← / ⌘→ mean line-start / line-end inside a text field, and ⌘⌫ means
      // delete-to-start. Never steal those from an input the user is typing in.
      const el = e.target
      const typing = el instanceof HTMLElement &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

      const key = e.key.toLowerCase()

      /* PREMIUM-UX 2026-08-31 ─ the one binding with no modifier ───────────────
         Esc is checked BEFORE the `mod` gate, because Escape with a modifier is
         not a thing anyone presses. It is the universal "back out of this", and
         the panel had none at all — the only way out of focus mode or an open
         drawer was to find the control that opened it.

         The precedence chain lives in SessionPanel; it deliberately ends at
         "nothing", never at ending the session. */
      if (key === 'escape') {
        if (typing) return   // the transcript input owns Esc while it is open
        e.preventDefault()
        onEscape?.()
        return
      }

      if (!mod) return

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
        // PREMIUM-UX 2026-08-31: focus mode — grow the panel to read a long
        // answer. F for focus; ⌘⇧F is unbound elsewhere in the app.
        else if (key === 'f')     { e.preventDefault(); onFocus?.() }
        else if (key === 'enter') { e.preventDefault(); onScreenshot?.() }
        else if (key === 'backspace') { e.preventDefault(); onClearTranscript?.() }
        return
      }

      if (key === 'enter')          { e.preventDefault(); onAnswer?.() }
      // PIPELINE 2026-08-31: ⌘. — the macOS convention for "stop what you are
      // doing", and unbound here. Safe while typing: it is not a text-editing
      // key, and stopping a runaway answer is exactly as useful mid-typing.
      else if (key === '.')         { e.preventDefault(); onStopGenerating?.() }
      else if (key === 'backspace') { if (!typing) { e.preventDefault(); onClearAnswer?.() } }
      else if (key === 'arrowleft') { if (!typing) { e.preventDefault(); onPrev?.() } }
      else if (key === 'arrowright'){ if (!typing) { e.preventDefault(); onNext?.() } }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    // onType, onStop, onCopy, onRetry,
    onType, onStop, onCopy, onRetry, onStopGenerating, onFocus, onEscape,
    onAnswer, onScreenshot, onChat, onClearTranscript, onClearAnswer, onPrev, onNext,
  ])
}

/* PREMIUM-UX 2026-08-31 ─ the overlay is keyboard-driven and could not scroll ──
   Every action had a chord, and the one thing a candidate does most — read past
   the eleventh line of an answer — required the trackpad. Bare keys, because
   these are the keys that scroll everywhere else, and guarded by the same
   `typing` test the chords use so j/k still type letters in the chat composer.

   Setting scrollTop directly fires the element's own onScroll, which is what
   maintains AnswerPanel's `pinned` ref — so following-the-stream keeps working
   with no extra wiring. */
const LINE_PX = 24      // ~13.5px at line-height 1.75
const PAGE_OVERLAP = 40 // keep a little context across a page turn

export function useAnswerScroll(bodyRef, enabled = true) {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const target = e.target
      if (target instanceof HTMLElement &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }

      const el = bodyRef.current
      if (!el) return

      const page = Math.max(LINE_PX, el.clientHeight - PAGE_OVERLAP)
      const key = e.key

      let delta = null
      if (key === 'PageDown') delta = page
      else if (key === 'PageUp') delta = -page
      else if (key === ' ') delta = e.shiftKey ? -page : page
      else if (key === 'ArrowDown' || key === 'j') delta = LINE_PX
      else if (key === 'ArrowUp' || key === 'k') delta = -LINE_PX
      else if (key === 'Home') delta = -el.scrollHeight
      else if (key === 'End') delta = el.scrollHeight

      if (delta === null) return
      e.preventDefault()
      el.scrollTop += delta
      // Not a smooth behaviour: a smooth scroll racing a streamed token produces
      // a fight between the two.
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [bodyRef, enabled])
}
