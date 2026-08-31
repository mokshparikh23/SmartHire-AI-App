import { useEffect, useState } from 'react'

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
    /* PREMIUM-UX 2026-08-31: floor 0.55 -> 0.68. backdrop-filter is inert on
       this window, so below about 0.68 the panel is genuinely see-through and
       body text over a bright shared screen is unreadable at ANY text alpha.
       The slider was offering the user a setting that breaks the product. */
    // const alpha = Math.min(0.95, Math.max(0.55, (overlayOpacity ?? 90) / 100))
    const alpha = Math.min(0.95, Math.max(0.68, (overlayOpacity ?? 90) / 100))
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
  onType, onStop, onCopy, onRetry, onStopGenerating, onFocus, onEscape, onGoLive, onHelp,
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

      /* PREMIUM-UX 2026-08-31: `?` opens the shortcut sheet. Bare, like Esc, and
         for the same reason — it is what every other keyboard-driven surface
         uses, and it is not a chord anyone has to be told about twice. Guarded
         on `typing`, since it is a character. */
      if (e.key === '?' && !typing) {
        e.preventDefault()
        onHelp?.()
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
      // PREMIUM-UX 2026-08-31: ⌘↓ jumps back to the live pair from a pinned turn.
      else if (key === 'arrowdown') { if (!typing) { e.preventDefault(); onGoLive?.() } }
      else if (key === 'arrowleft') { if (!typing) { e.preventDefault(); onPrev?.() } }
      else if (key === 'arrowright'){ if (!typing) { e.preventDefault(); onNext?.() } }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    // onType, onStop, onCopy, onRetry,
    onType, onStop, onCopy, onRetry, onStopGenerating, onFocus, onEscape, onGoLive, onHelp,
    onAnswer, onScreenshot, onChat, onClearTranscript, onClearAnswer, onPrev, onNext,
  ])
}

/* PREMIUM-UX 2026-08-31 ─ one list, read by the bindings AND by the sheet ─────
   Nothing in this app told the user what any of these were. Every chord lived
   only in the switch below, most appeared in no tooltip, and ⌘⇧X — which ends a
   paid interview — appeared nowhere at all.

   Exported so components/overlay/HotkeySheet.jsx renders FROM the same array
   the handler reads. A sheet maintained separately is a sheet that goes out of
   date the first time a binding moves, which is worse than no sheet: it teaches
   a chord that does not work.

   `destructive` is the one flag the sheet needs — it marks the thing you want
   to warn about rather than advertise. */
export const HOTKEYS = [
  { group: 'Reading', combo: 'pgdn',        label: 'Down a page', bare: true },
  { group: 'Reading', combo: 'pgup',        label: 'Up a page', bare: true },
  { group: 'Reading', combo: 'j',           label: 'Down a line', bare: true },
  { group: 'Reading', combo: 'k',           label: 'Up a line', bare: true },
  { group: 'Reading', combo: 'end',         label: 'Jump to the end', bare: true },
  { group: 'Reading', combo: 'mod down',    label: 'Back to the newest answer' },
  { group: 'Reading', combo: 'mod shift f', label: 'Taller panel for reading' },

  { group: 'Asking',  combo: 'mod enter',       label: 'Answer now / answer again' },
  { group: 'Asking',  combo: 'mod shift enter', label: 'Screenshot and ask about it' },
  { group: 'Asking',  combo: 'mod shift k',     label: 'Type a question' },
  { group: 'Asking',  combo: 'mod shift j',     label: 'Chat' },

  { group: 'Managing', combo: 'mod .',          label: 'Stop generating' },
  { group: 'Managing', combo: 'mod shift r',    label: 'Retry' },
  { group: 'Managing', combo: 'mod shift c',    label: 'Copy the answer' },
  { group: 'Managing', combo: 'mod del',        label: 'Clear what the card shows' },
  { group: 'Managing', combo: 'mod shift del',  label: 'Clear the question' },
  { group: 'Managing', combo: 'mod left',       label: 'Previous turn' },
  { group: 'Managing', combo: 'mod right',      label: 'Next turn' },

  { group: 'Window', combo: 'mod shift h', label: 'Hide and show the panel' },
  { group: 'Window', combo: 'mod shift m', label: 'Move to the next corner' },
  { group: 'Window', combo: 'esc',         label: 'Back out of whatever is open', bare: true },

  { group: 'Session', combo: 'mod shift x', label: 'End the session (press twice)', destructive: true },
]

/* PREMIUM-UX 2026-08-31 ─ "still waiting on the server" is its own state ──────
   Between sending a request and the first token there was one indistinguishable
   "thinking" state, whether the answer was 400ms away or the server had stopped
   responding entirely. Four seconds is well past a normal time-to-first-token
   and well short of the 30s deadline in aiBackend.js, so it is the window where
   telling the user "this is slower than usual" is both true and useful.

   One timer and one boolean: this costs a single extra render per stalled
   request, and none at all on a healthy one. */
const STALL_HINT_MS = 4000

export function useStallWatch(active) {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!active) { setSlow(false); return }
    const id = setTimeout(() => setSlow(true), STALL_HINT_MS)
    return () => { clearTimeout(id); setSlow(false) }
  }, [active])

  return slow
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
