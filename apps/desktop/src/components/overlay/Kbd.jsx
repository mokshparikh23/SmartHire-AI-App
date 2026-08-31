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

const IS_MAC = (globalThis.navigator?.platform || '').toLowerCase().includes('mac')

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
