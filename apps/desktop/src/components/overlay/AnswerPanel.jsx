import React, { useEffect, useLayoutEffect, useRef } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import Icon from '../ui/Icon'
import Kbd from './Kbd'

/**
 * The streaming answer body.
 *
 * This is the ONLY component that re-renders while an answer streams — it is
 * the sole subscriber to currentAnswer. Everything above it in the tree
 * subscribes to booleans, so a token costs one leaf render. The redesign
 * preserves that: the toolbar and transcript bar deliberately do not read it.
 *
 * REDESIGN 2026-08-29: the question and the answer are now labelled blocks in
 * one card, and the footer carries a timestamp and thumbs instead of the word
 * count and the Retry/Copy pair (those moved into the toolbar's ⋮ menu).
 */
// Copy and Retry are no longer props — they moved into the toolbar's ⋮ menu,
// which reads currentAnswer at click time rather than subscribing to it.
export default function AnswerPanel() {
  const answer        = useSessionStore((s) => s.currentAnswer)
  const question      = useSessionStore((s) => s.currentQuestion)
  const questionAt    = useSessionStore((s) => s.questionAt)
  const isThinking    = useSessionStore((s) => s.isThinking)
  const error         = useSessionStore((s) => s.error)
  const blockedReason = useSessionStore((s) => s.blockedReason)
  const activeTurnId  = useSessionStore((s) => s.activeTurnId)
  const feedback      = useSessionStore((s) =>
    s.turns.find((t) => t.id === s.activeTurnId)?.feedback ?? null)
  const setFeedback   = useSessionStore((s) => s.setFeedback)

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

  // REDESIGN 2026-08-29: "Answer · HH:MM" replaces the word count. questionAt
  // covers the turn still streaming; selectTurn repoints it at turns[].ts.
  const stamp = questionAt
    ? new Date(questionAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <>
      <div className="ia-body" ref={bodyRef} onScroll={handleScroll}>
        {question && (
          <div className="ia-qa">
            <Icon name="chat" size={15} />
            <p className="ia-question-text">
              <span className="ia-qa-label">Question:</span>
              {question}
            </p>
          </div>
        )}

        {blockedReason ? (
          /* Running out of credits is a state with an action, not a red string. */
          <div className="ia-blocked">
            <span>{error || 'You have run out of credits.'}</span>
            <button onClick={() => window.electronAPI?.getWebUrl?.().then((url) =>
              url && window.electronAPI?.openExternal?.(`${url}/dashboard/billing`))}>
              Top up credits
            </button>
          </div>
        ) : error ? (
          <p className="ia-error">{error}</p>
        ) : answer ? (
          <div className="ia-qa ia-qa--answer">
            <Icon name="sparkle" size={15} />
            <p className="ia-answer">
              <span className="ia-qa-label">Answer:</span>
              {answer}
              {isThinking && <span className="ia-caret" />}
            </p>
          </div>
        ) : isThinking ? (
          <span className="ia-dots"><i /><i /><i /></span>
        ) : !question ? (
          <div className="ia-empty">
            <Icon name="mic" size={20} strokeWidth={1.4} />
            <span>Answers appear here as questions are asked</span>
          </div>
        ) : null}
      </div>

      <div className="ia-footer">
        {/* <span className="ia-meta">{words ? `${words} words` : ''}</span> */}
        <span className="ia-meta">{answer && stamp ? `Answer · ${stamp}` : ''}</span>
        <span className="ia-spacer" />

        {/* Feedback is session-local — no table, no endpoint. Only a committed
            turn can carry it, so this is inert while an answer streams. */}
        <button
          className="ia-vote"
          data-on={feedback === 'up'}
          disabled={!activeTurnId || !answer}
          onClick={() => setFeedback(activeTurnId, 'up')}
          title="Good answer"
        >
          <Icon name="thumbUp" size={13} />
        </button>
        <button
          className="ia-vote ia-vote--down"
          data-on={feedback === 'down'}
          disabled={!activeTurnId || !answer}
          onClick={() => setFeedback(activeTurnId, 'down')}
          title="Bad answer"
        >
          <Icon name="thumbDown" size={13} />
        </button>
      </div>
    </>
  )
}

/**
 * REDESIGN 2026-08-29: the card's own header row — pager on the left, clear and
 * expand on the right. Kept in this file because it belongs to the answer card,
 * but split out so it can sit above the scrolling body rather than inside it.
 */
export function AnswerCardHead({
  children, onClear, onExpand, canClear, clearCombo = 'mod del', clearTitle = 'Clear the answer',
}) {
  return (
    <div className="ia-card-head">
      {children}
      <span className="ia-spacer" />
      <button className="ia-pill" onClick={onClear} disabled={!canClear} title={clearTitle}>
        Clear <Kbd combo={clearCombo} />
      </button>
      <button className="ia-btn ia-btn--ghost" onClick={onExpand} title="Expand">
        <Icon name="expand" size={14} />
      </button>
    </div>
  )
}
