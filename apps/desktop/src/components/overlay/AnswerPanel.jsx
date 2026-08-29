import React, { useEffect, useLayoutEffect, useRef } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import Icon from '../ui/Icon'

/**
 * The streaming answer body.
 *
 * This is the ONLY component that re-renders while an answer streams — it is
 * the sole subscriber to currentAnswer. Everything above it in the tree
 * subscribes to booleans, so a token costs one leaf render.
 */
export default function AnswerPanel({ onRegenerate, onCopy }) {
  const answer     = useSessionStore((s) => s.currentAnswer)
  const question   = useSessionStore((s) => s.currentQuestion)
  const isThinking = useSessionStore((s) => s.isThinking)
  const error      = useSessionStore((s) => s.error)

  const bodyRef   = useRef(null)
  const pinnedRef = useRef(true)

  // Follow the stream only while the user is already at the bottom. Scrolling
  // up to re-read must not be yanked back down on the next token.
  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  useLayoutEffect(() => {
    if (pinnedRef.current && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [answer])

  // A new question always starts at the top.
  useEffect(() => {
    pinnedRef.current = true
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [question])

  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0

  return (
    <>
      <div className="ia-body" ref={bodyRef} onScroll={handleScroll}>
        {error ? (
          <p className="ia-error">{error}</p>
        ) : answer ? (
          <p className="ia-answer">
            {answer}
            {isThinking && <span className="ia-caret" />}
          </p>
        ) : isThinking ? (
          <span className="ia-dots"><i /><i /><i /></span>
        ) : (
          <div className="ia-empty">
            <Icon name="mic" size={20} strokeWidth={1.4} />
            <span>Answers appear here as questions are asked</span>
          </div>
        )}
      </div>

      <div className="ia-footer">
        <span className="ia-meta">{words ? `${words} words` : ''}</span>
        <span className="ia-spacer" />
        <button
          className="ia-action"
          onClick={onRegenerate}
          disabled={isThinking || !question}
          title="Answer again"
        >
          <Icon name="reset" size={12} />
          Retry
        </button>
        <button
          className="ia-action"
          onClick={() => onCopy(answer)}
          disabled={!answer}
          title="Copy answer"
        >
          <Icon name="copy" size={12} />
          Copy
        </button>
      </div>
    </>
  )
}
