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

/* PREMIUM-UX 2026-08-31 ─ the word pills are retired ──────────────────────────
   They existed because the reference design showed them, and for a long question
   they were actively worse: each pill is flex-shrink:0 with padding and a gap, so
   the same words took far more horizontal room in a row that could only show
   about fifty characters anyway.

   They were also the entire source of the commit jank. At the moment an
   utterance committed, the row hard-swapped from flowing text to chips of a
   different total width in one frame, with no transition on either element.
   Rendering the committed question as flowing text with the same metrics as the
   live text makes commit a COLOUR CHANGE at the same pixel positions.

const CHUNK = 3
function chunkWords(text) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const out = []
  for (let i = 0; i < words.length; i += CHUNK) out.push(words.slice(i, i + CHUNK).join(' '))
  return out
}
*/

// export default function TranscriptBar({
//   question, source, typing, state, levelRef, partialRef,
//   onSubmit, onCancelTyping, onClear, onExpand,
// }) {
// PREMIUM-UX 2026-08-31: heldRef and onAnswerNow added — see the rAF below.
export default function TranscriptBar({
  question, source, typing, state, levelRef, partialRef, heldRef,
  onSubmit, onCancelTyping, onClear, onExpand, onAnswerNow,
}) {
  const inputRef = useRef(null)
  const wordsRef = useRef(null)
  const liveRef = useRef(null)
  // PREMIUM-UX 2026-08-31: written imperatively from the same rAF as the caption.
  const rowRef = useRef(null)
  const clearRef = useRef(null)
  const answerNowRef = useRef(null)

  /* The committed question, mirrored into a ref at render time rather than put
     in the rAF's dependency array. The loop reads it to decide whether Clear is
     live; adding it as a dependency would tear the loop down and rebuild it
     every time a question landed, mid-utterance. */
  const questionRef = useRef(question)
  questionRef.current = question

  useEffect(() => {
    if (typing) inputRef.current?.focus()
  }, [typing])

  /* Keep the newest words in view as an utterance lands. useLayoutEffect so the
     jump happens in the same frame as the paint, not one frame later.

     PREMIUM-UX 2026-08-31: dead now. The row wraps to two clamped lines instead
     of scrolling sideways, so .ia-words has no horizontal overflow to chase —
     this was a no-op write on every committed question.

  useLayoutEffect(() => {
    const el = wordsRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [question])  */

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
    let paintedHeld = null

    const tick = () => {
      const el = liveRef.current
      const text = partialRef.current || ''
      // Only touch the DOM when the text actually changed — most frames it has
      // not, and textContent writes force layout.
      if (el && text !== painted) {
        painted = text
        el.textContent = text
        // PREMIUM-UX 2026-08-31: the caption wraps to two lines now rather than
        // scrolling sideways, so there is no scrollLeft to chase.
        // el.parentElement.scrollLeft = el.parentElement.scrollWidth
      }

      /* PREMIUM-UX 2026-08-31 ─ make WAITING look different from STALLED ───────
         The aggregator can hold a fragment for several seconds while it waits to
         see whether the sentence continues. onHoldChange re-paints the same
         span with byte-identical pixels, and the comment in useInterviewSession
         claims persisting text "is the clearest possible signal that the app is
         waiting on purpose". It is not — it is pixel-identical to a hang, and it
         is a direct cause of the reported "the app gets stuck".

         One attribute, written only when it changes. The CSS does the rest. */
      const held = !!(heldRef?.current)
      if (rowRef.current && held !== paintedHeld) {
        paintedHeld = held
        rowRef.current.dataset.held = String(held)
      }

      /* PREMIUM-UX 2026-08-31 ─ Clear was dead exactly when it was needed ──────
         disabled={!question} gated on the COMMITTED question, so while the
         caption showed a mis-heard live sentence — the one moment a user wants
         to throw it away — the only button that could was greyed out. The
         handler behind it already did the right thing.

         Written from here because the live text is a ref by design; a React
         subscription would re-render this component once per spoken word. */
      const canClear = !!questionRef.current || !!text || held
      if (clearRef.current && clearRef.current.disabled === canClear) {
        clearRef.current.disabled = !canClear
      }
      // "Answer now" is only meaningful while something is actually held.
      if (answerNowRef.current) answerNowRef.current.disabled = !held

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [partialRef, heldRef])

  return (
    // PREMIUM-UX 2026-08-31: rowRef carries data-held, written from the rAF.
    // <div className="ia-glass ia-bar ia-transcript">
    <div className="ia-glass ia-bar ia-transcript" ref={rowRef} data-panel-state={state}>
      <span className="ia-meter-chip" data-state={state}>
        <StatusIndicator state={state} levelRef={levelRef} compact />
      </span>

      {/* PREMIUM-UX 2026-08-31: two states are not communicable by colour. A red
          chip says "something is wrong"; only words say the microphone is not
          being captured, or that the server has gone quiet. These change at most
          once per state, so rendering them costs nothing on the streaming path. */}
      {state === 'deaf' && <span className="ia-state-label">Audio is not being captured</span>}
      {state === 'slow' && <span className="ia-state-label">Still waiting on the server…</span>}

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
          {/* PREMIUM-UX 2026-08-31: flowing text, not pills — see the note at
              the top of this file. Same metrics as .ia-live, so committing is a
              colour change rather than a re-layout. */}
          <span className="ia-committed">
            {question ? (
              // chunkWords(question).map((g, i) => <span className="ia-word" key={i}>{g}</span>)
              <span className="ia-committed-text">{question}</span>
            ) : (
              <span className="ia-waiting">
                {source === 'manual' ? 'Type a question…' : 'Listening for a question…'}
              </span>
            )}
          </span>
        </span>
      )}

      {/* PREMIUM-UX 2026-08-31: the words for the held state. Permanently
          mounted and revealed by CSS off data-held — a render per hold would
          put this component on the per-utterance path it is built to stay off.
          Different words, different colour, different element: unmistakably
          "waiting on purpose" rather than "stopped working". */}
      <span className="ia-held-hint">waiting for the rest…</span>

      {/* PREMIUM-UX 2026-08-31: during a hold there was nothing at all to press
          — ⌘↵ re-sent the COMMITTED question, which is precisely what does not
          exist yet. Permanently mounted and revealed by CSS off data-held, so
          showing it costs no render and no new store subscription. */}
      <button
        className="ia-pill ia-answer-now"
        ref={answerNowRef}
        onClick={onAnswerNow}
        title={`Answer what has been heard so far (${comboLabel('mod enter')})`}
      >
        Answer now <Kbd combo="mod enter" />
      </button>

      <button
        className="ia-pill"
        ref={clearRef}
        onClick={onClear}
        // PREMIUM-UX 2026-08-31: `disabled` is written from the rAF above, so it
        // can account for the live caption — which lives in a ref, not in state.
        // disabled={!question}
        title={`Clear the transcript (${comboLabel('mod shift del')})`}
      >
        Clear <Kbd combo="mod shift del" />
      </button>

      {/* PREMIUM-UX 2026-08-31: this said "Expand" and carried the expand icon,
          and toggled the TYPE INPUT — while the identical icon and title on the
          answer card toggled the turn drawer. Say what it does. */}
      {/* <button className="ia-btn ia-btn--ghost" onClick={onExpand} title="Expand"> */}
      <button
        className="ia-btn ia-btn--ghost"
        onClick={onExpand}
        title={`Type a question (${comboLabel('mod shift k')})`}
      >
        <Icon name="keyboard" size={14} />
      </button>
    </div>
  )
}
