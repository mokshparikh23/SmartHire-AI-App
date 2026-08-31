import React from 'react'

/**
 * REDESIGN 2026-08-29: the shortcut chip shown inside toolbar pills, the two
 * Clear buttons and the turn pager.
 *
 * Defined once because the redesign puts a chip on nearly every control, and a
 * per-call-site style would drift. The symbols are the macOS glyphs; on Windows
 * and Linux the modifier is spelled Ctrl, so `mod` is translated rather than
 * hard-coded — otherwise every chip in the app would lie on those platforms.
 */

/* PLACEMENT 2026-09-01 ─ ask the process, not the user agent ──────────────────
   navigator.platform is deprecated and is being frozen by browsers: Chromium
   already reduces it under user-agent reduction, and the string it returns is a
   compatibility artefact rather than a fact about the machine. Every chip in the
   app is rendered from this one boolean, so when it eventually stops saying
   "MacIntel" the whole toolbar starts telling macOS users to press Ctrl.

   preload.cjs has exposed `platform: process.platform` all along and nothing
   used it. That value comes from Node in the main process and cannot be spoofed
   or reduced. The old read stays as the fallback for the one case the preload
   bridge is absent — a renderer opened outside Electron, which is how the panel
   is inspected in a plain browser during development.

   const IS_MAC = (globalThis.navigator?.platform || '').toLowerCase().includes('mac') */
const IS_MAC = globalThis.electronAPI?.platform
  ? globalThis.electronAPI.platform === 'darwin'
  : (globalThis.navigator?.platform || '').toLowerCase().includes('mac')

const GLYPH = {
  mod:    IS_MAC ? '⌘' : 'Ctrl',   // ⌘
  shift:  '⇧',                     // ⇧
  alt:    IS_MAC ? '⌥' : 'Alt',    // ⌥
  enter:  '↵',                     // ↵
  del:    '⌫',                     // ⌫
  left:   '←',                     // ←
  right:  '→',                     // →
  // PREMIUM-UX 2026-08-31: ⌘↓ is "go to the newest answer" while a past turn is
  // pinned. Without a glyph, `down` would render as the literal word DOWN.
  down:   '↓',                     // ↓
  up:     '↑',                     // ↑
  // PREMIUM-UX 2026-08-31: the bare reading keys the hotkey sheet lists.
  pgup:   '⇞',
  pgdn:   '⇟',
  end:    'End',
  home:   'Home',
  esc:    'Esc',
}

/**
 * @param {string} combo space-separated tokens, e.g. "mod enter" or "mod shift del".
 *                       Anything not in GLYPH is rendered as-is and upper-cased,
 *                       so "mod shift k" gives ⌘⇧K.
 */
export default function Kbd({ combo }) {
  const parts = combo.split(' ').filter(Boolean).map((t) => GLYPH[t] ?? t.toUpperCase())
  return <kbd className="ia-kbd">{parts.join('')}</kbd>
}

/** The same string without markup — for `title` tooltips. */
export function comboLabel(combo) {
  return combo.split(' ').filter(Boolean).map((t) => GLYPH[t] ?? t.toUpperCase()).join('')
}
