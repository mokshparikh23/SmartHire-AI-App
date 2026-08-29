import React, { useEffect, useRef } from 'react'

/**
 * Listening dot, live level meter and elapsed timer.
 *
 * The meter reads the mic level from a ref inside its own animation frame and
 * writes straight to the DOM. Routing a 60fps signal through React state would
 * re-render the panel on every frame for a purely decorative element.
 */
const BARS = 3
const RMS_CEILING = 45   // level at which the bars are full height

export default function StatusIndicator({ state, levelRef, elapsed }) {
  const barsRef = useRef([])

  useEffect(() => {
    if (!levelRef) return
    let raf = 0
    let smoothed = 0

    const tick = () => {
      // Ease toward the raw level so the bars settle instead of strobing.
      smoothed += ((levelRef.current || 0) - smoothed) * 0.35
      const norm = Math.min(1, smoothed / RMS_CEILING)

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
  }, [levelRef])

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

      <span className="ia-meter" aria-hidden="true">
        {Array.from({ length: BARS }, (_, i) => (
          <i key={i} ref={(el) => { barsRef.current[i] = el }} />
        ))}
      </span>

      <span className="ia-label">{label}</span>
      <span className="ia-timer">{mm}:{ss}</span>
    </div>
  )
}
