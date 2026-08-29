import React, { useEffect, useRef } from 'react'
import Icon from '../ui/Icon'

/**
 * The question block. Shows the question that was heard, or — when the user
 * presses the keyboard button — swaps to a single-line input at the same
 * height, so opening it never changes the panel's layout.
 */
export default function TranscriptBar({ question, source, typing, onSubmit, onCancelTyping }) {
  const inputRef = useRef(null)

  useEffect(() => {
    if (typing) inputRef.current?.focus()
  }, [typing])

  if (typing) {
    return (
      <div className="ia-question">
        <Icon name="keyboard" size={14} />
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
      </div>
    )
  }

  if (!question) {
    return (
      <div className="ia-question ia-question--waiting">
        <Icon name="mic" size={14} />
        <p>Listening for a question…</p>
      </div>
    )
  }

  return (
    <div className="ia-question">
      <Icon name={source === 'manual' ? 'keyboard' : 'mic'} size={14} />
      <p>{question}</p>
    </div>
  )
}
