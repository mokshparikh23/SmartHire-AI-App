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
  /* PIPELINE 2026-08-31: 3500 -> 5000, tolerated silence 4.2s -> 5.7s. This is
     the lowest-confidence number in this file and should be tuned against real
     audio rather than by reasoning.

     It costs nothing in the common case: hold() takes min(at + 1100, ceiling),
     so a single dangling fragment still emits at +1100 and this never binds. It
     binds only when fragments or fillers keep re-arming the hold across a
     silence — which is exactly the multi-pause question we are trying to keep
     together, e.g. an interviewer reading a scenario off their screen. */
  // maxHoldMs: 3500,
  maxHoldMs: 5000,

  /* Gap between a fragment's speech end and a later speech start under which the
     resumption belongs to the same utterance. Equal to the total dangling budget
     on purpose, so the evidence-based and timer-based paths agree at the
     boundary instead of contradicting each other. */
  continuationGapMs: 1800,

  /* ~100 words. Far beyond any interview question; bounds prompt growth. */
  /* PIPELINE 2026-08-31: 600 chars is ~100 words, which is roughly 40 seconds of
     speech — well INSIDE the length of an ordinary multi-part question ("here is
     the setup… given that… how would you…"). Far from being "far beyond any
     interview question", it was cutting normal ones in half. 1200 is ~200 words.

     This is not free: the utterance goes into every prompt, and this is a
     metered product. It is affordable because HISTORY_TURNS x
     HISTORY_ANSWER_CHARS in useInterviewSession already dwarfs it, and because
     the cap is now a backstop rather than the thing that routinely fires. */
  // maxUtteranceChars: 600,
  maxUtteranceChars: 1200,

  /* From the first held fragment's speech start, and the ONLY thing bounding a
     speaker who never pauses. Sits above useVoice's MAX_SEGMENT_MS (12s) plus
     one hold, so a segment cut and an utterance cut cannot collide.
     ^ SUPERSEDED — see the PIPELINE note immediately below. */
  /* PIPELINE 2026-08-31 ─ one cap was measuring two different things ──────────
     Measured from firstSpeechStartedAt, this budget was charged for the length
     of the audio itself AND for the transcription round trip. The user
     experiences neither as a wait: they were listening to the question during
     the first, and the app cannot act during the second.

     That is why a slow transcribe was catastrophic rather than merely slow. On
     the segmented path a 12s max-segment cut plus a >2.9s upload arrived ALREADY
     over budget, so process() hit the cap at its safety check before the verdict
     was even consulted and emitted instantly — every 12s chunk becoming its own
     question, with nothing ever stitched. A bigger number would not have fixed
     that; a slower connection eats any number.

     So: two bounds, each measuring the thing it actually cares about.

     maxUtteranceMs is a LATENCY bound, measured from firstPushAt — the moment
     there was text we could have answered. Independent of network speed by
     construction.

     maxUtteranceSpeechMs is a CONTENT bound: how much speech one question may
     cover. Both its timestamps come from the VAD's own clock, so it is
     latency-free by construction, and it is the one that will normally bind —
     deliberately, because cutting on elapsed speech is smoother than cutting
     mid-word on a character count.

     The old coupling to useVoice's MAX_SEGMENT_MS is REMOVED, not adjusted.
     Once the budget starts at arrival the two constants are on different clocks
     and there is nothing left to keep in step. */
  // maxUtteranceMs: 15000,
  maxUtteranceMs: 20000,
  maxUtteranceSpeechMs: 45000,

  /* PIPELINE 2026-08-31: how many times one question may be extended after a cap
     forced it out early. Bounds the merge chain in useInterviewSession so a
     monologue cannot regrow the prompt without limit. */
  maxContinuations: 2,

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
// SELF-VOICE 2026-08-31: `onSpeechStart` added — see noteSpeechStart below for
// what it is for. Optional and defaulted, so nothing that does not pass it
// changes behaviour by a single instruction.
// export function createUtteranceAggregator({
//   emit, onHoldChange, score, now: nowFn, setTimer, clearTimer, log, tuning,
// } = {}) {
export function createUtteranceAggregator({
  emit, onHoldChange, onSpeechStart, score, now: nowFn, setTimer, clearTimer, log, tuning,
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

  /* PIPELINE 2026-08-31 ─ what the last emit was, so the next one can extend it ─
     { id, final, speechEndedAt, chainSeq }, or null. This is the entire memory
     the merge path needs: an incoming fragment that starts soon after a
     NON-final emit is the rest of that same question, not a new one. */
  let lastEmit = null

  const clearHoldTimer = () => {
    if (holdTimer !== null) { disarm(holdTimer); holdTimer = null }
  }

  // PIPELINE 2026-08-31: `scored` lets process() hand over the verdict it has
  // already computed, instead of this scoring the same string a second time.
  // Falls back to scoring for the flush() path, which has none.
  // const emitNow = (reason) => {
  const emitNow = (reason, scored) => {
    if (!held) return
    clearHoldTimer()

    const at = now()
    // const verdict = scoreFn(held.text, { minCompleteTokens: cfg.minCompleteTokens })
    const verdict = scored || scoreFn(held.text, { minCompleteTokens: cfg.minCompleteTokens })

    /* PIPELINE 2026-08-31 ─ is this a finished question? ───────────────────────
       The first attempt keyed this on the RELEASE REASON: a cap firing while the
       speaker was still talking meant "truncated", and a hold expiring meant
       "they finished". The replay harness immediately produced the case that
       breaks it (fixture A, the 40s chopped question):

         "means we get lock contention under load and"

       released by hold-expired, because the transcript for the rest of the
       sentence was still uploading when the hold ran out. By the reason rule
       that is a finished question. It plainly is not one.

       So the question is answered by the TEXT, not by the clock: an utterance is
       final when it reads as complete. Everything else — a cap cutting it, a
       hold running out mid-upload — leaves a half-sentence, and a half-sentence
       is exactly what the next fragment should be allowed to extend.

       This is safe to be generous with because `final` alone does not merge
       anything. process() also requires the next speech to have STARTED within
       continuationGapMs of this one ending, which is what keeps two genuinely
       separate questions separate (fixtures 2 and D). Being wrong in this
       direction stitches two halves of one question; being wrong in the other
       direction answers half a question and then throws that answer away, which
       is the bug this whole change exists to fix. */
    const forced = verdict.verdict !== VERDICT.COMPLETE

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

      /* PIPELINE 2026-08-31 ─ the three fields the caller could not do without ──
         emit's payload always carried reason and verdict, and useInterviewSession
         passed only u.text — so generate() could not tell a forced mid-sentence
         cut ("more of this question is coming") from a finished question ("this
         supersedes the last one"). It treated both as new questions, aborting the
         answer on screen and blanking the card each time. A 40-second question
         became three or four calls, of which only the last fragment was answered.

         final:     false when the emitted text does not read as a finished
                    question — see the note above.
         continues: the id of the utterance this extends, or null.
         chainSeq:  0 for the head of a chain, 1..n for its extensions. */
      final: !forced,
      continues: held.continues,
      chainSeq: held.chainSeq,
    }

    held = null
    holdDeadline = 0
    onHoldChange?.('')

    lastEmit = {
      id: payload.id,
      final: payload.final,
      speechEndedAt: payload.speechEndedAt,
      chainSeq: payload.chainSeq,
    }

    log?.('emit', {
      id: payload.id, reason, verdict: payload.verdict, lang: payload.lang,
      chars: payload.chars, fragments: payload.fragments,
      heldMs: Math.round(payload.heldMs),
      final: payload.final, continues: payload.continues, chainSeq: payload.chainSeq,
    })
    emit?.(payload)
  }

  // PIPELINE 2026-08-31: from firstPushAt, not firstSpeechStartedAt. See the
  // note on maxUtteranceMs above — this is a latency budget, and measuring it
  // from speech start charged it for the audio's length and the upload.
  // const overUtteranceCap = (at) =>
  //   held && at - held.firstSpeechStartedAt >= cfg.maxUtteranceMs
  const overUtteranceCap = (at) =>
    held && at - held.firstPushAt >= cfg.maxUtteranceMs

  /* PIPELINE 2026-08-31: the content bound. Both timestamps come from the VAD,
     so no amount of network latency can make this fire early — which is the
     property the old single cap did not have. */
  const overSpeechCap = () =>
    held && held.lastSpeechEndedAt - held.firstSpeechStartedAt >= cfg.maxUtteranceSpeechMs

  const onHoldExpired = (reason) => {
    holdTimer = null
    if (!held || disposed) return

    const at = now()
    if (overUtteranceCap(at)) { emitNow('cap-ms'); return }
    // PIPELINE 2026-08-31: the speech-span cap is checked wherever the wall cap
    // is. With noteSpeechEnd no longer falsifying `speaking` on a max-segment
    // cut (see below), these two are the ONLY things bounding a continuous
    // talker — maxHoldMs no longer reaches that case at all.
    if (overSpeechCap()) { emitNow('cap-speech'); return }

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
    if (overSpeechCap()) { emitNow('cap-speech'); return }

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
      /* PIPELINE 2026-08-31 ─ is this the rest of the last question? ───────────
         Only asked when a fresh `held` is being created, because that is the
         only moment a NEW utterance begins. Three conditions, all narrow:

           - the previous emit was NOT final, i.e. it did not read as finished;
           - the chain has not already been extended maxContinuations times;
           - this speech began soon enough after that one ended.

         continuationGapMs is reused verbatim rather than given a sibling: it
         already means "this resumption belongs to the same utterance", which is
         precisely the question here, and two constants that must agree are two
         constants that will eventually disagree. */
      const startedAt = meta.speechStartedAt ?? at
      const extends_ = lastEmit
        && !lastEmit.final
        && lastEmit.chainSeq < cfg.maxContinuations
        && startedAt - lastEmit.speechEndedAt <= cfg.continuationGapMs

      held = {
        text: clean,
        fragments: [clean],
        firstSpeechStartedAt: startedAt,
        lastSpeechEndedAt: endedAt,
        firstPushAt: at,
        continues: extends_ ? lastEmit.id : null,
        chainSeq: extends_ ? lastEmit.chainSeq + 1 : 0,
      }
      if (extends_) log?.('continues', { of: lastEmit.id, seq: held.chainSeq })
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
    /* PIPELINE 2026-08-31: the verdict is passed through to emitNow now. It was
       already computed one line above, and the cap fired BEFORE it was consulted
       — so a question that genuinely ended at the character cap was labelled a
       forced truncation and would have wrongly invited a merge. Same text, same
       instant, correct label. */
    // if (held.text.length >= cfg.maxUtteranceChars) { emitNow('cap-chars'); return }
    // if (overUtteranceCap(at)) { emitNow('cap-ms'); return }
    if (held.text.length >= cfg.maxUtteranceChars) { emitNow('cap-chars', verdict); return }
    if (overUtteranceCap(at)) { emitNow('cap-ms', verdict); return }
    if (overSpeechCap()) { emitNow('cap-speech', verdict); return }

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

      /* SELF-VOICE 2026-08-31 ─ the moment the candidate stopped talking ───────
         The instant the interviewer begins speaking is, by construction, the
         instant the candidate finished. That is the cheapest possible trigger
         for harvesting what the candidate just said, and it is free: this edge
         is already being detected for a different reason.

         Fired LAST, after the state above is settled, so a listener that reads
         inspect() sees the new state rather than the old one. The listener is
         expected not to block — useInterviewSession's only starts an upload and
         returns, which is what keeps the zero-added-latency guarantee intact. */
      onSpeechStart?.(at)
    },

    /**
     * The VAD closed a segment: the speaker has stopped. This is what starts the
     * clock that can actually expire, and it fires BEFORE the transcript for
     * that speech arrives — which is the window the hold has to cover.
     */
    /* PIPELINE 2026-08-31 ─ a recorder cut is not a speaker stopping ───────────
       silenceDetector fires endSegment('max-segment') when a segment has run its
       full length WHILE THE SPEAKER IS STILL ABOVE THRESHOLD, and both capture
       hooks forwarded that here as a speech end. So on every 12-second cut this
       file was told the speaker had stopped when they had not — falsifying
       `speaking`, the one signal the header at the top argues outranks every
       word list, and switching hold()'s ceiling from Infinity to
       lastSpeechEndAt + maxHoldMs in the middle of a sentence.

       It self-corrected a frame later when the VAD's next tick re-fired
       onSpeechStart, but the utterance could be cut inside that window.

       The policy stays here rather than in the hooks: this file owns the
       end-of-turn decision and the hooks stay dumb reporters. The default keeps
       every existing caller — and every existing replay case — byte-identical.

       CONSEQUENCE, worth stating plainly: with `speaking` no longer falsified,
       maxHoldMs no longer bounds a chopped monologue at all. maxUtteranceMs and
       maxUtteranceSpeechMs are now the only things that do. */
    // noteSpeechEnd(at) {
    //   speaking = false
    //   lastSpeechEndAt = at
    //   …
    // },
    noteSpeechEnd(at, reason = 'silence') {
      if (disposed) return
      if (reason !== 'max-segment') speaking = false
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
      // PIPELINE 2026-08-31: a new session must not extend the last session's
      // truncated question.
      lastEmit = null
      onHoldChange?.('')
    },

    dispose() {
      disposed = true
      clearHoldTimer()
      held = null
      lastEmit = null
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
