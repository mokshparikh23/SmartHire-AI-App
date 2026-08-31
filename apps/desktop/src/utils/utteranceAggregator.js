/* SEGMENTATION 2026-08-30 ─────────────────────────────────────────────────────
   A 700ms silence timer is not a turn-end signal.

   "So what is" … [1s] … "tell me about class in C#" was closed after the first
   fragment, answered as a meaningless three-word question, then superseded by
   the second — two LLM calls, two turns, and neither of them the question that
   was actually asked.

   Raising SILENCE_MS globally was rejected: it taxes every question to fix the
   minority that pause, and the LATENCY 2026-08-30 note in useVoice.js lowered it
   from 1200ms to 700ms on measured evidence that still holds.

   So the fragment is SCORED instead, and only a fragment that looks unfinished
   waits. A question that already looks complete is emitted at exactly the
   instant it always was — zero added latency in the common case, which is the
   property the whole design is built around and the one the replay harness
   asserts mechanically.

   THE BEST SIGNAL IS NOT LINGUISTIC. Whether the speaker is talking RIGHT NOW is
   free, instant and identical in every language, and it outranks every word list
   in this file. Hence noteSpeechStart/noteSpeechEnd: the aggregator tracks the
   VAD's speaking state directly rather than inferring it from text.

   WHY IT NEEDS BOTH EDGES, NOT JUST THE START. Traced against the segmented
   path, where the transcript lands ~700ms after the audio:

     t=900   "So what is" ends
     t=2000  speech resumes                    <- start edge
     t=2250  transcript for fragment 1 arrives -> hold 1100ms, deadline 3350
     t=3350  ...but the speaker is STILL TALKING, and a deadline computed from a
             start edge alone expires right here and emits the stub. The bug,
             reproduced inside the fix.
     t=3600  "tell me about class in C sharp" ends
     t=4300  segment closes                    <- end edge
     t=5000  transcript for fragment 2 arrives -> joined, COMPLETE, one emit

   So a hold that expires while `speaking` is true re-arms instead of emitting,
   and the end edge is what starts the clock that can actually run out. The only
   thing bounding a talker who never pauses is maxUtteranceMs, which is checked
   on every expiry rather than only on arrival.

   NO REACT, NO DOM, NO TIMERS OF ITS OWN. The clock and the timer functions are
   injected, which is what lets scripts/segment-replay.mjs drive a twenty-second
   scenario to completion in under a millisecond, deterministically, with no test
   runner in the repo to hang it off.  */

// Explicit .js extensions, unlike the extensionless imports elsewhere in src/.
// Vite accepts both; bare node accepts only these, and the replay harness
// imports this file directly.
import { scoreCompleteness, VERDICT } from './completeness/index.js'
import { joinFragments } from './textFormatter.js'
import { worthAnswering } from './utterance.js'

export const SEGMENT_DEFAULTS = {
  /* Total silence tolerated on a dangling tail is 700 + 1100 = 1800ms.
     Hesitation pauses in spontaneous speech cluster at 0.5–1.5s; past about two
     seconds it is usually a real turn end. And the clock only starts once the
     VAD says the speaker actually stopped, so this never binds mid-sentence. */
  holdDanglingMs: 1100,

  /* For OPEN — no signal either way. Total 1150ms, under the ~1s "did it hang?"
     threshold for a UI that is already painting a live caption. Cheap insurance
     for the unknown-language and no-word-list cases. */
  holdUnknownMs: 450,

  /* Absolute cap on waiting, measured from the moment SPEECH LAST ENDED — not
     from the first fragment, which would expire while the speaker is still
     mid-question. The stated upper bound for a pause inside one question was
     ~3s; this leaves margin and bounds the silent wait at 700 + 3500 = 4.2s. */
  maxHoldMs: 3500,

  /* Gap between a fragment's speech end and a later speech start under which the
     resumption belongs to the same utterance. Equal to the total dangling budget
     on purpose, so the evidence-based and timer-based paths agree at the
     boundary instead of contradicting each other. */
  continuationGapMs: 1800,

  /* ~100 words. Far beyond any interview question; bounds prompt growth. */
  maxUtteranceChars: 600,

  /* From the first held fragment's speech start, and the ONLY thing bounding a
     speaker who never pauses. Sits above useVoice's MAX_SEGMENT_MS (12s) plus
     one hold, so a segment cut and an utterance cut cannot collide. */
  maxUtteranceMs: 15000,

  minCompleteTokens: 4,
}

/**
 * @param {object}   o
 * @param {Function} o.emit           called once per finished utterance
 * @param {Function} [o.onHoldChange] (text) => void — held text, '' when idle
 * @param {Function} [o.score]        defaults to scoreCompleteness
 * @param {Function} [o.now]          defaults to performance.now
 * @param {Function} [o.setTimer]     (ms, fn) => handle
 * @param {Function} [o.clearTimer]   (handle) => void
 * @param {Function} [o.log]          (event, data) => void
 * @param {object}   [o.tuning]       overrides for SEGMENT_DEFAULTS
 */
export function createUtteranceAggregator({
  emit, onHoldChange, score, now: nowFn, setTimer, clearTimer, log, tuning,
} = {}) {
  const cfg = { ...SEGMENT_DEFAULTS, ...(tuning || {}) }
  const now = nowFn || (() => performance.now())
  const scoreFn = score || scoreCompleteness
  const arm = setTimer || ((ms, fn) => setTimeout(fn, ms))
  const disarm = clearTimer || ((h) => clearTimeout(h))

  /** null when nothing is held. */
  let held = null
  let holdTimer = null
  let holdDeadline = 0

  /** The VAD's speaking state, mirrored here. */
  let speaking = false
  let speechActiveSince = -Infinity
  let lastSpeechEndAt = -Infinity

  let nextId = 0
  let disposed = false

  const clearHoldTimer = () => {
    if (holdTimer !== null) { disarm(holdTimer); holdTimer = null }
  }

  const emitNow = (reason) => {
    if (!held) return
    clearHoldTimer()

    const at = now()
    const verdict = scoreFn(held.text, { minCompleteTokens: cfg.minCompleteTokens })
    const payload = {
      id: ++nextId,
      text: held.text,
      reason,
      verdict: verdict.verdict,
      verdictReason: verdict.reason,
      lang: verdict.lang,
      fragments: held.fragments.length,
      chars: held.text.length,
      speechStartedAt: held.firstSpeechStartedAt,
      speechEndedAt: held.lastSpeechEndedAt,
      // The latency THIS FILE added: how long the text sat here before release.
      // Must be 0 for anything scored COMPLETE — that is the assertion proving
      // the common case did not regress.
      heldMs: Math.max(0, at - held.firstPushAt),
    }

    held = null
    holdDeadline = 0
    onHoldChange?.('')

    log?.('emit', {
      id: payload.id, reason, verdict: payload.verdict, lang: payload.lang,
      chars: payload.chars, fragments: payload.fragments,
      heldMs: Math.round(payload.heldMs),
    })
    emit?.(payload)
  }

  const overUtteranceCap = (at) =>
    held && at - held.firstSpeechStartedAt >= cfg.maxUtteranceMs

  const onHoldExpired = (reason) => {
    holdTimer = null
    if (!held || disposed) return

    const at = now()
    if (overUtteranceCap(at)) { emitNow('cap-ms'); return }

    // Expiring mid-sentence is precisely the bug being fixed. Re-arm; the
    // utterance cap above is what stops this from recurring forever.
    if (speaking) { hold(cfg.holdDanglingMs, 'still-speaking'); return }

    emitNow(`hold-expired:${reason}`)
  }

  /**
   * Arms or re-arms the hold. While the speaker is talking the deadline is
   * simply pushed out; once they stop, maxHoldMs from that moment is the cap.
   */
  function hold(ms, reason) {
    if (!held) return
    const at = now()

    if (overUtteranceCap(at)) { emitNow('cap-ms'); return }

    const ceiling = speaking ? Infinity : lastSpeechEndAt + cfg.maxHoldMs
    const deadline = Math.min(at + ms, ceiling)
    const delay = deadline - at

    if (delay <= 0) { emitNow(`cap-hold:${reason}`); return }

    clearHoldTimer()
    holdDeadline = deadline
    holdTimer = arm(delay, () => onHoldExpired(reason))
    onHoldChange?.(held.text)
    log?.('hold', { reason, ms: Math.round(delay), chars: held.text.length, speaking })
  }

  const process = (clean, meta) => {
    const at = now()
    const endedAt = meta.speechEndedAt ?? at

    if (!held) {
      held = {
        text: clean,
        fragments: [clean],
        firstSpeechStartedAt: meta.speechStartedAt ?? at,
        lastSpeechEndedAt: endedAt,
        firstPushAt: at,
      }
    } else {
      // Timestamps running backwards means a fragment overtook its predecessor.
      // useVoice serialises transcription so this should not happen; if it does,
      // the text is still appended in arrival order and this line is the record.
      if (endedAt < held.lastSpeechEndedAt) {
        log?.('out-of-order', {
          incoming: Math.round(endedAt), held: Math.round(held.lastSpeechEndedAt),
        })
      }
      held.text = joinFragments(held.text, clean)
      held.fragments.push(clean)
      held.lastSpeechEndedAt = Math.max(held.lastSpeechEndedAt, endedAt)
    }

    const verdict = scoreFn(held.text, { minCompleteTokens: cfg.minCompleteTokens })
    log?.('verdict', {
      verdict: verdict.verdict, reason: verdict.reason, lang: verdict.lang,
      tokens: verdict.tokens, tail: verdict.tail,
    })

    // Safety caps first; nothing below may override them.
    if (held.text.length >= cfg.maxUtteranceChars) { emitNow('cap-chars'); return }
    if (overUtteranceCap(at)) { emitNow('cap-ms'); return }

    // The free signal, in two forms. Either the speaker is talking right now, or
    // they spoke again after this fragment's audio ended and that speech is
    // itself still on its way here as a fragment. Both mean: do not answer yet.
    if (verdict.verdict !== VERDICT.COMPLETE) {
      if (speaking) { hold(cfg.holdDanglingMs, 'speech-active'); return }
      if (speechActiveSince > endedAt && speechActiveSince - endedAt <= cfg.continuationGapMs) {
        hold(cfg.holdDanglingMs, 'speech-resumed-since'); return
      }
    }

    if (verdict.verdict === VERDICT.COMPLETE) { emitNow('complete'); return }
    if (verdict.verdict === VERDICT.DANGLING) { hold(cfg.holdDanglingMs, 'dangling'); return }
    hold(cfg.holdUnknownMs, 'open')
  }

  return {
    /**
     * @param {string} text
     * @param {{seq?: number, speechStartedAt?: number, speechEndedAt?: number,
     *          speechMs?: number}} [meta]
     */
    pushFragment(text, meta = {}) {
      if (disposed) return
      const clean = (text || '').trim()

      // A filler or a sub-threshold scrap while something is held is EVIDENCE,
      // not content: an "umm" in the middle of a question means the speaker is
      // still going. Re-arm the hold and keep it out of the prompt.
      if (!worthAnswering(clean)) {
        log?.('drop', { text: clean, held: !!held })
        if (held) hold(cfg.holdDanglingMs, 'filler-mid-hold')
        // Nothing held, so nothing will clear the caption later. useLiveVoice's
        // commit() used to call onPartial('') unconditionally; this is the one
        // path where that still has to happen.
        else onHoldChange?.('')
        return
      }

      log?.('fragment', {
        seq: meta.seq, chars: clean.length,
        speechMs: meta.speechMs != null ? Math.round(meta.speechMs) : undefined,
      })
      process(clean, meta)
    },

    /** The VAD saw the silent→speaking edge. */
    noteSpeechStart(at) {
      if (disposed) return
      speaking = true
      speechActiveSince = at
      if (held && holdTimer !== null) hold(cfg.holdDanglingMs, 'speech-resumed')
    },

    /**
     * The VAD closed a segment: the speaker has stopped. This is what starts the
     * clock that can actually expire, and it fires BEFORE the transcript for
     * that speech arrives — which is the window the hold has to cover.
     */
    noteSpeechEnd(at) {
      if (disposed) return
      speaking = false
      lastSpeechEndAt = at
      if (held && holdTimer !== null) hold(cfg.holdDanglingMs, 'speech-ended')
    },

    /** Release whatever is held, if anything. Used when capture stops. */
    flush(reason = 'flush') {
      if (!disposed && held) emitNow(reason)
    },

    /** Drop what is held WITHOUT emitting. Used when a session starts. */
    reset() {
      clearHoldTimer()
      held = null
      holdDeadline = 0
      speaking = false
      speechActiveSince = -Infinity
      lastSpeechEndAt = -Infinity
      onHoldChange?.('')
    },

    dispose() {
      disposed = true
      clearHoldTimer()
      held = null
      // PIPELINE 2026-08-31: dispose() left whatever was painted on screen
      // forever — the caption is driven from onHoldChange and nothing else
      // clears it once this instance stops answering.
      onHoldChange?.('')
    },

    /* PIPELINE 2026-08-31 ─ why a one-way flag needs a reader ──────────────────
       dispose() is deliberately one-way: reset() does not undo it, because
       "disposed" means the instance is gone, not idle.

       But useInterviewSession holds this in a REF, and a ref survives
       StrictMode's simulated remount while the effect cleanup that calls
       dispose() does not. Its `if (aggRef.current === null)` guard therefore saw
       a non-null — and permanently dead — aggregator and never rebuilt it. Under
       `npm run dev` the app ran with a disposed aggregator and emitted zero
       questions: pushFragment returned on its first line, the mic meter animated,
       and the caption stayed empty forever.

       The guard needs to ask "is this a LIVE aggregator?", not "is this
       non-null?". That is a correct invariant in production too, where the
       cleanup only runs on a genuine unmount. */
    isDisposed: () => disposed,

    inspect: () => ({
      holding: !!held,
      text: held?.text || '',
      fragments: held?.fragments.length || 0,
      holdDeadline, speaking, speechActiveSince, lastSpeechEndAt, nextId,
      disposed,
    }),
  }
}
