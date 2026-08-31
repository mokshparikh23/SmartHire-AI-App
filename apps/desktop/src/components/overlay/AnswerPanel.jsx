import React, { useEffect, useLayoutEffect, useRef } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { useSettingsStore } from '../../store/settingsStore'
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

  /* PREMIUM-UX 2026-08-31 ─ do not yank a reader who scrolled away ────────────
     "A new question always starts at the top" contradicted the pin-aware
     auto-follow immediately above it. A question can land at ANY moment — the
     aggregator emits whenever the interviewer stops talking — so the sequence
     was: candidate scrolls up to re-read the first paragraph, interviewer says
     one more sentence, and the answer is blanked and the body jumps to the top
     mid-read.

     Honour the same pin the scroll handler maintains. If the reader had already
     scrolled away from the live edge, leave them where they are. */
  // useEffect(() => {
  //   pinnedRef.current = true
  //   if (bodyRef.current) bodyRef.current.scrollTop = 0
  // }, [question])
  useEffect(() => {
    if (!pinnedRef.current) return
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [question])

  // REDESIGN 2026-08-29: "Answer · HH:MM" replaces the word count. questionAt
  // covers the turn still streaming; selectTurn repoints it at turns[].ts.
  const stamp = questionAt
    ? new Date(questionAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''

  /*
    ANSWER-STYLE 2026-08-30: the labels follow the mode, because with 'followups'
    shipping as the default they were describing the other product. "Answer:"
    over a list of questions to ask is not a cosmetic wrong label — it is the
    panel telling an interviewer to read them out, which is the exact failure the
    pivot exists to prevent.

    Source matters too. A [TYPED] or [SCREENSHOT] turn is answered even in
    followups mode — the prompt says so in as many words — so "Ask next:" over
    one of those would be a second wrong label swapped in for the first.

    Both of these change at most once per turn, so subscribing is as cheap as the
    booleans everything above this component subscribes to. The rule this file is
    built on — that currentAnswer has exactly one subscriber — is untouched.
  */
  const followups = useSettingsStore((s) => s.answerMode === 'followups')
  const source    = useSessionStore((s) => s.source)

  const heard  = source === 'voice'
  const qLabel = followups ? (heard ? 'Heard:'    : 'You asked:') : 'Question:'
  const aLabel = followups ? (heard ? 'Ask next:' : 'Reply:')     : 'Answer:'

  return (
    <>
      <div className="ia-body" ref={bodyRef} onScroll={handleScroll}>
        {question && (
          <div className="ia-qa">
            <Icon name="chat" size={15} />
            <p className="ia-question-text">
              {/* <span className="ia-qa-label">Question:</span> */}
              <span className="ia-qa-label">{qLabel}</span>
              {question}
            </p>
          </div>
        )}

        {/* PREMIUM-UX 2026-08-31 ─ content wins over a session-level state ─────
            blockedReason was tested FIRST, so it hid everything below it. It is
            set from chat's failure path too (sendChat's finally), which meant a
            402 raised by a chat message painted the amber "Top up credits" panel
            over an answer that had streamed back perfectly — the user toggles
            out of chat and their answer is gone.

            Running out of credits is a state of the SESSION. It must never hide
            content that already arrived. So `answer` moves to the front and
            nothing else moves: blockedReason still outranks `error`, because
            reportFailure sets BOTH on a 402 and the amber panel is the one that
            carries the button that fixes it. */}
        {/* {blockedReason ? (…) : error ? (…) : answer ? (…) : …} */}
        {answer ? (
          <div className="ia-qa ia-qa--answer">
            <Icon name="sparkle" size={15} />
            <p className="ia-answer">
              {/* <span className="ia-qa-label">Answer:</span> */}
              <span className="ia-qa-label">{aLabel}</span>
              {answer}
              {isThinking && <span className="ia-caret" />}
            </p>
          </div>
        ) : blockedReason ? (
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
        ) : isThinking ? (
          <span className="ia-dots"><i /><i /><i /></span>
        ) : !question ? (
          <div className="ia-empty">
            <Icon name="mic" size={20} strokeWidth={1.4} />
            {/* <span>Answers appear here as questions are asked</span> */}
            <span>
              {followups
                ? 'Follow-ups appear here as the candidate speaks'
                : 'Answers appear here as questions are asked'}
            </span>
          </div>
        ) : null}
      </div>

      <div className="ia-footer">
        {/* <span className="ia-meta">{words ? `${words} words` : ''}</span> */}
        {/* <span className="ia-meta">{answer && stamp ? `Answer · ${stamp}` : ''}</span> */}
        {/* ANSWER-STYLE 2026-08-30: the same label as the block above it, minus
            its colon, so the footer cannot disagree with what it is stamping. */}
        <span className="ia-meta">
          {answer && stamp ? `${aLabel.replace(':', '')} · ${stamp}` : ''}
        </span>
        <span className="ia-spacer" />

        {/* Feedback is session-local — no table, no endpoint. Only a committed
            turn can carry it, so this is inert while an answer streams. */}
        <button
          className="ia-vote"
          data-on={feedback === 'up'}
          disabled={!activeTurnId || !answer}
          onClick={() => setFeedback(activeTurnId, 'up')}
          // title="Good answer"
          title={followups ? 'Good suggestion' : 'Good answer'}
        >
          <Icon name="thumbUp" size={13} />
        </button>
        <button
          className="ia-vote ia-vote--down"
          data-on={feedback === 'down'}
          disabled={!activeTurnId || !answer}
          onClick={() => setFeedback(activeTurnId, 'down')}
          // title="Bad answer"
          title={followups ? 'Bad suggestion' : 'Bad answer'}
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
// ANSWER-STYLE 2026-08-30: the default is only reached when a caller omits
// clearTitle, and SessionPanel — the one caller — always passes it. Kept in step
// with the panel's own vocabulary anyway, so an omission does not reintroduce
// the wrong word.
// export function AnswerCardHead({
//   children, onClear, onExpand, canClear, clearCombo = 'mod del', clearTitle = 'Clear the answer',
// }) {
export function AnswerCardHead({
  children, onClear, onExpand, canClear, clearCombo = 'mod del', clearTitle = 'Clear what is showing',
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
