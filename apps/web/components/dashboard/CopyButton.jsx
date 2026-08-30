'use client'

import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/ui/Icon'

/**
 * Copy-to-clipboard button.
 *
 * COPY-FEEDBACK 2026-08-30: the confirmation used to be a hard swap — the icon
 * and the word changed between two frames, with no transition and no change to
 * the button itself. At 12px, in the corner of a wide field, that is invisible:
 * you click, nothing appears to move, and the only way to know it worked is to
 * paste somewhere. Three things fix it, and all three matter:
 *
 *   1. The whole button flashes into the positive tone. Colour across the full
 *      chrome is what the eye catches peripherally; a 13px glyph is not.
 *   2. The icons cross-fade and scale in the same slot, so the check ARRIVES
 *      rather than replacing. The check overshoots slightly (back-out easing) —
 *      that little pop is what reads as "done", the same reason a checkmark
 *      lands rather than appears everywhere else.
 *   3. Both labels are stacked in one grid cell, so the button is already as
 *      wide as "Copied" before you click it. The old version resized mid-swap,
 *      which reads as a layout glitch, not as confirmation.
 *
 * Reduced motion needs no guard here: the global block in globals.css zeroes
 * transition-duration, which leaves the colour and label change intact and
 * simply removes the travel. The state is still legible, it just snaps.
 */
export default function CopyButton({ text, label = 'Copy' }) {
  // 'idle' | 'copied' | 'failed'
  const [state, setState] = useState('idle')
  const timer = useRef(null)

  // The old version called setTimeout without keeping a handle. Clicking twice
  // inside the window left the FIRST timer running, so the second confirmation
  // cleared itself early — right when the user was looking for it.
  useEffect(() => () => clearTimeout(timer.current), [])

  const flash = (next) => {
    clearTimeout(timer.current)
    setState(next)
    timer.current = setTimeout(() => setState('idle'), 2000)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      flash('copied')
    } catch {
      // COPY-FEEDBACK 2026-08-30: was a silent catch, commented —
      //   "clipboard can be blocked; leaving the label unchanged is the honest cue"
      // Unchanged is not a cue, it is the absence of one, and it looks exactly
      // like the dead click this whole component was failing to rule out. A
      // blocked clipboard (insecure origin, denied permission) now says so, so
      // the user knows to select the key by hand instead of clicking again.
      flash('failed')
    }
  }

  const copied = state === 'copied'
  const failed = state === 'failed'

  const tone = copied
    ? 'border-positive/40 bg-positive-soft text-positive'
    : failed
      ? 'border-critical/40 bg-critical-soft text-critical'
      : 'border-line bg-paper text-ink-soft hover:border-ink/30 hover:text-ink'

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : failed ? 'Copy failed' : label || 'Copy'}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-[color,background-color,border-color] duration-200 ease-[var(--ease-entrance)] ${tone}`}
    >
      {/* One slot, three glyphs stacked on top of each other. Fixed to the icon
          size so the button never reflows as they trade places. */}
      <span className="relative grid h-[13px] w-[13px] shrink-0 place-items-center">
        <Icon
          name="copy"
          size={13}
          className={`col-start-1 row-start-1 transition duration-200 ease-[var(--ease-exit)] ${
            state === 'idle' ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
        />
        <Icon
          name="check"
          size={13}
          strokeWidth={2}
          className={`col-start-1 row-start-1 transition duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            copied ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
        />
        <Icon
          name="warning"
          size={13}
          className={`col-start-1 row-start-1 transition duration-200 ease-[var(--ease-entrance)] ${
            failed ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
        />
      </span>

      {/* Same trick for the words: the cell is as wide as the longest of them,
          measured at render, so the confirmation cross-fades in place. Omitted
          entirely when the caller wants an icon-only button (admin/licenses),
          where `gap-1.5` then has nothing to space and collapses. */}
      {label && (
        <span className="grid">
          <span
            className={`col-start-1 row-start-1 transition-opacity duration-150 ${
              state === 'idle' ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {label}
          </span>
          <span
            className={`col-start-1 row-start-1 transition-opacity duration-200 delay-75 ${
              copied ? 'opacity-100' : 'opacity-0'
            }`}
          >
            Copied
          </span>
          <span
            className={`col-start-1 row-start-1 transition-opacity duration-200 delay-75 ${
              failed ? 'opacity-100' : 'opacity-0'
            }`}
          >
            Failed
          </span>
        </span>
      )}

      {/* The visual flash is the whole point of this component, and a screen
          reader sees none of it. Swapping the button's own aria-label is not
          enough — a label change on an already-focused element is not reliably
          announced — so the state is mirrored into a live region as well. */}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied to clipboard' : failed ? 'Could not copy — copy the text manually' : ''}
      </span>
    </button>
  )
}
