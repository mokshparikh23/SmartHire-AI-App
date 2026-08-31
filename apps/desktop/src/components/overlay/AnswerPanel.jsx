import React, { useEffect, useLayoutEffect, useRef } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { useSettingsStore } from '../../store/settingsStore'
import Icon from '../ui/Icon'
import Kbd, { comboLabel } from './Kbd'
// PREMIUM-UX 2026-08-31: PageUp/PageDown/j/k/Home/End over the answer body. The
// overlay is otherwise entirely keyboard-driven and reading — the thing done
// most — was trackpad-only.
import { useAnswerScroll } from '../../hooks/useOverlay'
// PREMIUM-UX 2026-08-31: streaming-safe markdown, no dependency. See its header.
import Markdown from './Markdown'

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
// PREMIUM-UX 2026-08-31: onRetry backs the "no answer came back" branch;
// readerPinnedRef is mirrored out so generate() can decide whether a new
// question may take the card. Props rather than store reads, so this leaf keeps
// its single-subscription discipline.
// export default function AnswerPanel() {
export default function AnswerPanel({ onRetry, readerPinnedRef }) {
  /* PREMIUM-UX 2026-08-31 ─ pinned reading, and why it is CHEAPER ─────────────
     While a past turn is pinned, the live stream is irrelevant to this leaf.
     Selecting '' in that case means zustand's equality check bails out and a
     streamed token re-renders NOTHING at all — strictly cheaper than before,
     where every token re-rendered this component whatever was on screen. */
  const pinned        = useSessionStore((s) =>
    (s.pinnedTurnId ? s.turns.find((t) => t.id === s.pinnedTurnId) : null) ?? null)
  // const answer     = useSessionStore((s) => s.currentAnswer)
  // const question   = useSessionStore((s) => s.currentQuestion)
  const liveAnswer    = useSessionStore((s) => (s.pinnedTurnId ? '' : s.currentAnswer))
  const liveQuestion  = useSessionStore((s) => (s.pinnedTurnId ? '' : s.currentQuestion))
  const answer        = pinned ? pinned.a : liveAnswer
  const question      = pinned ? pinned.q : liveQuestion
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

  // PREMIUM-UX 2026-08-31: mounted here rather than in SessionPanel because this
  // is where bodyRef lives. Setting scrollTop fires the onScroll below, so
  // pinnedRef stays correct and following-the-stream keeps working for free.
  useAnswerScroll(bodyRef)

  // Follow the stream only while the user is already at the bottom. Scrolling
  // up to re-read must not be yanked back down on the next token.
  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    pinnedRef.current = atEnd
    /* PREMIUM-UX 2026-08-31: drives the bottom fade that says "there is more
       below". Written straight onto the element, NOT through state — this fires
       on every wheel tick, and this component is the one leaf that re-renders
       per streamed token. A setState here would put a render on both paths. */
    el.dataset.atEnd = String(atEnd)
    /* PREMIUM-UX 2026-08-31: mirrored out so generate() can decide whether a new
       question may take the card. A ref, written here rather than lifted into
       state, for the same reason as everything else on this path. */
    if (readerPinnedRef) readerPinnedRef.current = atEnd
  }

  useLayoutEffect(() => {
    if (pinnedRef.current && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
    // PREMIUM-UX 2026-08-31: the answer growing can turn "at the end" into "not
    // at the end", so the fade has to be re-evaluated as it streams.
    handleScroll()
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
  // PREMIUM-UX 2026-08-31: the footer stamps whatever is SHOWING, so a pinned
  // turn carries its own time rather than the live one's.
  // const stamp = questionAt ? … : ''
  const shownAt = pinned ? pinned.ts : questionAt
  const stamp = shownAt
    ? new Date(shownAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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

  /* PREMIUM-UX 2026-08-31: a pinned turn shows ITS state, not the live one's —
     otherwise the spinner for a question streaming underneath would appear over
     a finished answer the reader is still on. */
  const shownError    = pinned ? (pinned.error ?? null) : error
  const shownThinking = pinned ? false : isThinking

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
            {/* PREMIUM-UX 2026-08-31: the answer was a bare React text child, so
                every **bold** the model emitted shipped literal asterisks and
                every "- item" was a hyphen mid-paragraph. See Markdown.jsx for
                why this is hand-rolled and how it keeps — and improves on — the
                one-leaf-render-per-token contract this file's header states.

                The label moves out of the paragraph and into its own element:
                baked in as an inline prefix it re-flowed with the body text on
                every token, and it cannot prefix a bulleted list at all. */}
            {/* <p className="ia-answer"><span className="ia-qa-label">{aLabel}</span>{answer}…</p> */}
            <div className="ia-answer">
              <span className="ia-qa-label">{aLabel}</span>
              <Markdown text={answer} />
              {shownThinking && <span className="ia-caret" />}
            </div>
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
        ) : shownError ? (
          <p className="ia-error">{shownError}</p>
        ) : shownThinking ? (
          <span className="ia-dots"><i /><i /><i /></span>
        ) : question ? (
          /* PREMIUM-UX 2026-08-31 ─ the branch that did not exist ──────────────
             A question with no answer, no error and nothing in flight used to
             fall through EVERY branch to null: the question header, a completely
             blank body, and nothing at all to press. It is reachable whenever a
             stream ends having produced no content, and it looks exactly like
             the app deciding not to answer.

             sessionStore.setAnswerDone now sets an error for the common cause,
             so this is the backstop — plus, unlike a bare error line, it carries
             the way out. */
          <div className="ia-empty ia-empty--result">
            <Icon name="warning" size={18} strokeWidth={1.4} />
            <span>No answer came back.</span>
            <button className="ia-pill" onClick={onRetry}>
              Try again <Kbd combo="mod shift r" />
            </button>
          </div>
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
// PREMIUM-UX 2026-08-31: `expanded` added — the expand button drives focus mode
// now rather than the turn drawer, so it has a state to reflect.
// export function AnswerCardHead({ children, onClear, onExpand, canClear, … }) {
export function AnswerCardHead({
  children, onClear, onExpand, expanded, canClear,
  // PREMIUM-UX 2026-08-31: the way back to the live pair while a past turn is
  // pinned. See the pinnedTurnId note in the store.
  pinned, liveThinking, onGoLive,
  clearCombo = 'mod del', clearTitle = 'Clear what is showing',
}) {
  return (
    <div className="ia-card-head">
      {children}
      <span className="ia-spacer" />

      {/* PREMIUM-UX 2026-08-31: the ONLY new pixel in the default path — it
          appears solely when a past turn is pinned, which never happens to a
          reader following along at the live edge. Amber while the live answer is
          still streaming, green once it is complete. */}
      {pinned && (
        <button
          className="ia-live-chip"
          data-streaming={!!liveThinking}
          onClick={onGoLive}
          title={`Jump to the newest answer (${comboLabel('mod down')})`}
        >
          <span className="ia-live-dot" />
          {liveThinking ? 'Answering…' : 'New answer'}
          <Kbd combo="mod down" />
        </button>
      )}
      <button className="ia-pill" onClick={onClear} disabled={!canClear} title={clearTitle}>
        Clear <Kbd combo={clearCombo} />
      </button>
      {/* PREMIUM-UX 2026-08-31: this said "Expand" and toggled the turn drawer.
          It now grows the panel for reading, which is what the icon has always
          promised — and it says which way it will go. The drawer is still one
          click away on the pager beside it, which is where history belongs. */}
      {/* <button className="ia-btn ia-btn--ghost" onClick={onExpand} title="Expand"> */}
      <button
        className="ia-btn ia-btn--ghost"
        data-on={!!expanded}
        onClick={onExpand}
        title={expanded
          ? `Back to the small panel (${comboLabel('mod shift f')})`
          : `Make the panel taller to read (${comboLabel('mod shift f')})`}
      >
        <Icon name={expanded ? 'collapse' : 'expand'} size={14} />
      </button>
    </div>
  )
}
