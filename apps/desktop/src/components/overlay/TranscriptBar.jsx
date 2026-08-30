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
  question, source, typing, state, levelRef,
  onSubmit, onCancelTyping, onClear, onExpand,
}) {
  const inputRef = useRef(null)
  const wordsRef = useRef(null)

  useEffect(() => {
    if (typing) inputRef.current?.focus()
  }, [typing])

  // Keep the newest words in view as an utterance lands. useLayoutEffect so the
  // jump happens in the same frame as the paint, not one frame later.
  useLayoutEffect(() => {
    const el = wordsRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [question])

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
      ) : question ? (
        <span className="ia-words" ref={wordsRef}>
          {chunkWords(question).map((group, i) => (
            <span className="ia-word" key={i}>{group}</span>
          ))}
        </span>
      ) : (
        <span className="ia-words ia-words--waiting">
          {source === 'manual' ? 'Type a question…' : 'Listening for a question…'}
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
