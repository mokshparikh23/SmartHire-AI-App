import React, { useCallback, useEffect, useRef, useState } from 'react'
import Kbd from './Kbd'

/* PLACEMENT 2026-09-01 ─────────────────────────────────────────────────────────
   Where to park the panel, chosen rather than guessed.

   ── Why a popover and not a full-screen zone overlay ──────────────────────────

   The reference design draws dashed zones across the whole display and lets you
   click one. That cannot be built on this window. The main process sizes the
   window to EXACTLY the panel while a session runs (enterSessionMode in
   electron/main.cjs), and the header of hooks/useOverlay.js explains why that is
   load-bearing: there is no window area outside the panel, so clicks beside it
   reach the app behind with nothing to intercept them. Painting a full-screen
   picker would mean either resizing the live window to the whole display — an
   always-on-top rectangle briefly covering the interviewer's video — or a second
   BrowserWindow, which is a second renderer to keep in step with this one.

   A popover anchored in the toolbar costs neither. The trade is that it shows no
   preview of the destination, which the labels and the six-cell grid carry
   instead.

   ── Keyboard, in the CAPTURE phase ────────────────────────────────────────────

   This is the one thing here that is not obvious. Two other window-level keydown
   listeners are live while the panel is open, both in the bubble phase:

     useAnswerScroll   binds bare ArrowUp/ArrowDown/j/k/Space/Home/End to scroll
                       the answer body.
     usePanelHotkeys   binds Escape and the modifier chords.

   Without capture, every arrow press aimed at this grid would ALSO scroll the
   answer underneath it. Capturing and calling stopPropagation on the keys this
   component owns is what stops that — and it does so without threading an
   `enabled` prop down through AnswerPanel, which is mid-refactor elsewhere.

   Escape is deliberately NOT handled here. SessionPanel owns the unwind order
   for the whole panel — picker, typing, drawer, focus mode, the armed End pill —
   and splitting that across two files is how the order silently goes wrong. This
   component focuses itself on mount so the target of that Escape is not an
   input, which is the one condition SessionPanel's chain needs to see it.  */

// The ids and the order must match ZONES in electron/main.cjs — main resolves
// the id and rejects anything else, so a drift here is a dead button, not a
// window in the wrong place.
const ZONES = [
  { id: 'tl', label: 'Top Left' },
  { id: 'tc', label: 'Top Center' },
  { id: 'tr', label: 'Top Right' },
  { id: 'bl', label: 'Bottom Left' },
  { id: 'bc', label: 'Bottom Center' },
  { id: 'br', label: 'Bottom Right' },
]

const COLS = 3

/**
 * Which cell the panel is already closest to, so the arrow keys start from where
 * the window is rather than always from the top-left.
 *
 * screen.availLeft/availTop are non-standard but present in Chromium, and in
 * Electron they follow the display the window is on. Everything here is one
 * try/catch because a wrong guess must degrade to a sensible default, never
 * throw inside a render — 'tc' is the panel's home column (panelBounds).
 */
function nearestZone() {
  try {
    const s = window.screen
    const left = s.availLeft ?? 0
    const top  = s.availTop  ?? 0
    const w = s.availWidth
    const h = s.availHeight
    if (!w || !h) return 'tc'

    const cx = window.screenX + window.outerWidth  / 2
    const cy = window.screenY + window.outerHeight / 2

    const col = Math.min(2, Math.max(0, Math.floor(((cx - left) / w) * 3)))
    const row = (cy - top) < h / 2 ? 0 : 1
    return ZONES[row * COLS + col].id
  } catch {
    return 'tc'
  }
}

export default function MovePicker({ onClose }) {
  const wrapRef = useRef(null)
  const [selected, setSelected] = useState(nearestZone)

  const apply = useCallback((id) => {
    window.electronAPI?.moveToZone?.(id)
    onClose?.()
  }, [onClose])

  // Focus the grid itself, so Escape does not arrive with an INPUT as its
  // target — usePanelHotkeys returns early on that, and the panel's Escape
  // chain would never run.
  useEffect(() => { wrapRef.current?.focus() }, [])

  // Click anywhere else closes, same shape as the ⋮ menu in Toolbar.jsx.
  useEffect(() => {
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) onClose?.() }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [onClose])

  useEffect(() => {
    const onKeyDown = (e) => {
      // Leave every chord alone. ⌘⇧M is global and never reaches the page at
      // all, but ⌘⌫, ⌘← and the rest are still the user's while this is open.
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const index = ZONES.findIndex((z) => z.id === selected)
      const row = Math.floor(index / COLS)
      const col = index % COLS

      let next = null
      if (e.key === 'ArrowLeft')       next = row * COLS + Math.max(0, col - 1)
      else if (e.key === 'ArrowRight') next = row * COLS + Math.min(COLS - 1, col + 1)
      else if (e.key === 'ArrowUp')    next = Math.max(0, row - 1) * COLS + col
      else if (e.key === 'ArrowDown')  next = Math.min(1, row + 1) * COLS + col
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); e.stopPropagation()
        apply(selected)
        return
      } else if (/^[1-6]$/.test(e.key)) {
        // A number is a decision, not a move of the selection — pressing 3 means
        // "top right", and waiting for a second key to confirm it would make the
        // fast path slower than the slow one.
        e.preventDefault(); e.stopPropagation()
        apply(ZONES[Number(e.key) - 1].id)
        return
      } else {
        return
      }

      e.preventDefault()
      e.stopPropagation()
      setSelected(ZONES[next].id)
    }

    // Capture, so this wins over useAnswerScroll's bare arrow keys. See header.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [selected, apply])

  return (
    <div className="ia-move" ref={wrapRef} tabIndex={-1}>
      <div className="ia-move-head">Move window</div>

      <div className="ia-move-grid">
        {ZONES.map((z, i) => (
          <button
            key={z.id}
            className="ia-move-zone"
            data-selected={z.id === selected}
            onMouseEnter={() => setSelected(z.id)}
            onClick={() => apply(z.id)}
            title={z.label}
          >
            <span className="ia-move-zone-num">{i + 1}</span>
            <span className="ia-move-zone-label">{z.label}</span>
          </button>
        ))}
      </div>

      <div className="ia-move-hint">
        <Kbd combo="1" />–<Kbd combo="6" /> or arrows · <Kbd combo="esc" /> to close
      </div>
    </div>
  )
}
