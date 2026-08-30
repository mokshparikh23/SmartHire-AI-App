import React, { useEffect, useLayoutEffect, useRef } from 'react'
import Icon from '../ui/Icon'
import Kbd, { comboLabel } from './Kbd'
import StatusIndicator from './StatusIndicator'

/**
 * The question block. Shows the question that was heard, or — when the user
 * presses the keyboard button — swaps to a single-line input at the same
 * height, so opening it never changes the panel's layout.
 *
 * REDESIGN 2026-08-29: the heard question is now word-group pills on one
 * horizontally scrolling row rather than a three-line clamped paragraph. That
 * keeps the bar at one fixed height no matter how long the question runs, which
 * is what lets the three bars sit at a stable size.
 */

/** Words per pill. Three reads as phrasing; one is confetti, five is a sentence. */
const CHUNK = 3

function chunkWords(text) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const out = []
  for (let i = 0; i < words.length; i += CHUNK) {
    out.push(words.slice(i, i + CHUNK).join(' '))
  }
  return out
}

export default function TranscriptBar({
  question, source, typing, state, levelRef, partialRef,
  onSubmit, onCancelTyping, onClear, onExpand,
}) {
  const inputRef = useRef(null)
  const wordsRef = useRef(null)
  const liveRef = useRef(null)

  useEffect(() => {
    if (typing) inputRef.current?.focus()
  }, [typing])

  // Keep the newest words in view as an utterance lands. useLayoutEffect so the
  // jump happens in the same frame as the paint, not one frame later.
  useLayoutEffect(() => {
    const el = wordsRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [question])

  /* LIVE CAPTION 2026-08-30 ─────────────────────────────────────────────────
     The partial transcript is painted straight to the DOM from a rAF loop,
     never through state or the store. It changes several times a second while
     someone talks, and this component sits inside the overlay panel — routing
     it through React would re-render the panel on every word, which is the
     exact thing sessionStore.js's header warns against.

     Same pattern, same reason, as StatusIndicator's level meter.

     No chunkWords() here: pills are for the committed question, where the text
     is final. Re-chunking every frame would make the words visibly re-flow as
     each one arrives. The live text is one flowing span that becomes pills at
     the moment it is committed. */
  useEffect(() => {
    if (!partialRef) return
    let raf = 0
    let painted = null

    const tick = () => {
      const el = liveRef.current
      const text = partialRef.current || ''
      // Only touch the DOM when the text actually changed — most frames it has
      // not, and textContent writes force layout.
      if (el && text !== painted) {
        painted = text
        el.textContent = text
        el.parentElement.scrollLeft = el.parentElement.scrollWidth
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [partialRef])

  return (
    <div className="ia-glass ia-bar ia-transcript">
      <span className="ia-meter-chip" data-state={state}>
        <StatusIndicator state={state} levelRef={levelRef} compact />
      </span>

      {typing ? (
        <input
          ref={inputRef}
          className="ia-input"
          placeholder="Type a question…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const value = e.currentTarget.value.trim()
              if (value) onSubmit(value)
              e.currentTarget.value = ''
            } else if (e.key === 'Escape') {
              onCancelTyping()
            }
          }}
        />
      ) : (
        /* LIVE CAPTION 2026-08-30: all three states are rendered, and CSS picks.
           The live span's content arrives imperatively, so React cannot branch
           on whether it is empty without the per-word re-render this design
           exists to avoid. `.ia-live:not(:empty) ~ .ia-committed { display:none }`
           does the same job for free — and it covers the case that matters most:
           once someone starts a SECOND question, the live text must replace the
           pills of the first, not appear underneath them. */
        <span className="ia-words" ref={wordsRef}>
          <span className="ia-live" ref={liveRef} />
          <span className="ia-committed">
            {question ? (
              chunkWords(question).map((group, i) => (
                <span className="ia-word" key={i}>{group}</span>
              ))
            ) : (
              <span className="ia-waiting">
                {source === 'manual' ? 'Type a question…' : 'Listening for a question…'}
              </span>
            )}
          </span>
        </span>
      )}

      <button
        className="ia-pill"
        onClick={onClear}
        disabled={!question}
        title={`Clear the transcript (${comboLabel('mod shift del')})`}
      >
        Clear <Kbd combo="mod shift del" />
      </button>

      <button className="ia-btn ia-btn--ghost" onClick={onExpand} title="Expand">
        <Icon name="expand" size={14} />
      </button>
    </div>
  )
}
