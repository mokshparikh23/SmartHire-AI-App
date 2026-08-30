import React, { useEffect, useRef } from 'react'
import { useSessionStore } from '../../store/sessionStore'

/**
 * Listening dot, live level meter and elapsed timer.
 *
 * The meter reads the mic level from a ref inside its own animation frame and
 * writes straight to the DOM. Routing a 60fps signal through React state would
 * re-render the panel on every frame for a purely decorative element.
 */
const BARS = 3
// const RMS_CEILING = 45   // level at which the bars are full height
/* SYSTEM-AUDIO 2026-08-30: the ceiling is per source now.
   45 was tuned against a mic running Chromium's automatic gain control, which
   holds speech inside a narrow band. The loopback tap deliberately runs with
   AGC off (see acquire() in hooks/useVoice.js), so its level is whatever the
   machine is actually playing at and has no upper bound of its own.

   55 rather than something larger because it was measured, not assumed: speech
   through the loopback tap at ordinary system volume peaked at 41.2 RMS, mean
   10.05. A far higher ceiling would leave the meter flat during normal speech;
   this reads about three-quarters on a peak and only pegs on genuinely loud
   material. Re-measure before changing it. */
const RMS_CEILING = { mic: 45, system: 55 }

// REDESIGN 2026-08-29: `compact` renders the meter bars alone, for the green
// chip at the left of the transcript bar. The dot, label and timer have no room
// there — the timer moved into the toolbar's ⋮ menu, and the state now reads
// from the bar colour (green listening, amber thinking, grey paused).
// export default function StatusIndicator({ state, levelRef, elapsed }) {
export default function StatusIndicator({ state, levelRef, elapsed, compact }) {
  const barsRef = useRef([])
  // Changes on a click, so this costs one render — unlike the level itself,
  // which stays in a ref precisely to keep 60fps out of React.
  const captureSource = useSessionStore((s) => s.captureSource)

  useEffect(() => {
    if (!levelRef) return
    let raf = 0
    let smoothed = 0
    const ceiling = RMS_CEILING[captureSource] || RMS_CEILING.mic

    const tick = () => {
      // Ease toward the raw level so the bars settle instead of strobing.
      smoothed += ((levelRef.current || 0) - smoothed) * 0.35
      const norm = Math.min(1, smoothed / ceiling)

      for (let i = 0; i < barsRef.current.length; i++) {
        const el = barsRef.current[i]
        if (!el) continue
        // Middle bar tallest, so it reads as a meter rather than a bar chart.
        const weight = i === 1 ? 1 : 0.62
        el.style.transform = `scaleY(${(0.25 + norm * weight * 0.75).toFixed(3)})`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // `ceiling` is read from captureSource inside, so the loop has to be rebuilt
    // when the source changes or the meter keeps the old scale.
  }, [levelRef, captureSource])

  const meter = (
    <span className="ia-meter" aria-hidden="true">
      {Array.from({ length: BARS }, (_, i) => (
        <i key={i} ref={(el) => { barsRef.current[i] = el }} />
      ))}
    </span>
  )

  // The rAF above is already wired to barsRef, so the compact form is the same
  // live meter with the surrounding chrome dropped.
  if (compact) return meter

  const mm = Math.floor(elapsed / 60).toString().padStart(2, '0')
  const ss = (elapsed % 60).toString().padStart(2, '0')

  const dotClass =
    state === 'thinking' ? 'ia-dot ia-dot--thinking'
    : state === 'listening' ? 'ia-dot ia-dot--live'
    : 'ia-dot'

  const label =
    state === 'thinking' ? 'Thinking'
    : state === 'listening' ? 'Listening'
    : 'Paused'

  return (
    <div className="ia-status">
      <span className={dotClass} />

      {meter}

      <span className="ia-label">{label}</span>
      <span className="ia-timer">{mm}:{ss}</span>
    </div>
  )
}
