import React, { useEffect } from 'react'
import { HOTKEYS } from '../../hooks/useOverlay'
import Kbd from './Kbd'
import Icon from '../ui/Icon'

/* PREMIUM-UX 2026-08-31 ─────────────────────────────────────────────────────────
   The panel is almost entirely keyboard-driven and nothing told anyone so.

   Most chords appeared in no tooltip and no menu. ⌘⇧X — which ends a paid,
   metered interview — appeared nowhere at all, so the only way most people met
   it was by ending an interview they did not mean to end.

   RENDERED FROM THE BINDINGS. HOTKEYS lives in useOverlay.js beside the handler
   that reads it, so this cannot teach a chord that no longer works. A sheet
   maintained separately would drift the first time a binding moved, and a wrong
   sheet is worse than no sheet.

   An in-panel overlay rather than a window: a second BrowserWindow over a live
   call is a second thing to get out of the way, and this one closes on Esc, on
   `?`, or on a click anywhere outside the card.
*/

const GROUPS = ['Reading', 'Asking', 'Managing', 'Window', 'Session']

export default function HotkeySheet({ onClose }) {
  useEffect(() => {
    const onKeyDown = (e) => {
      // Esc is handled by the panel's own precedence chain, which closes this
      // first; `?` is the toggle, so it closes what it opened.
      if (e.key === '?' || e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="ia-sheet-scrim" onMouseDown={onClose}>
      <div className="ia-sheet" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ia-sheet-head">
          <span>Keyboard shortcuts</span>
          <span className="ia-spacer" />
          <button className="ia-btn ia-btn--ghost" onClick={onClose} title="Close">
            <Icon name="close" size={13} />
          </button>
        </div>

        <div className="ia-sheet-body">
          {GROUPS.map((group) => {
            const rows = HOTKEYS.filter((h) => h.group === group)
            if (!rows.length) return null
            return (
              <div className="ia-sheet-group" key={group}>
                <h4>{group}</h4>
                {rows.map((h) => (
                  <div className="ia-sheet-row" key={h.combo} data-danger={!!h.destructive}>
                    <span>{h.label}</span>
                    <span className="ia-spacer" />
                    <Kbd combo={h.combo} />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
