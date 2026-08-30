/* SEGMENTATION 2026-08-30 ─────────────────────────────────────────────────────
   The shared voice-activity detector. This file was a 0-byte stub whose name
   already described what both capture hooks were doing in two byte-identical
   copies — useVoice.js's analyser loop and useLiveVoice.js's analyser loop were
   the same maths, the same constants and the same noise-floor tracking, differing
   only in what the silence timer triggered at the end.

   Two copies was already one too many. The aggregator needs a speech-START
   signal from both paths, and wiring that into two loops would have made three.

   The extraction is not only tidiness. useLiveVoice never had MAX_SEGMENT_MS or
   MIN_SPEECH_MS — its copy was written from useVoice's turn-detection half and
   the segment-management half was not part of that — so on the primary path a
   speaker who never dropped below threshold never committed at all, and a single
   cough cleared the threshold and committed 700ms later. Both close here, for
   both callers, with no new policy code.

   THE EMPIRICAL PARTS ARE COPIED, NOT REDERIVED. The noise-floor asymmetry, the
   threshold formula and every constant below came out of the VAD 2026-08-30 and
   LATENCY 2026-08-30 investigations recorded in useVoice.js. The originals are
   left commented in place there. Nothing here is a new number.

   AUDIO IN, EVENTS OUT. This file owns the AudioContext, the analyser, the rAF
   loop and the silence timer, and knows nothing about MediaRecorder, WebRTC,
   transcription or React. What it emits is timestamps.  */

/** Every value here is carried over unchanged from the two loops this replaces. */
export const VAD_DEFAULTS = {
  silenceMs:    700,    // silence before a segment is closed
  minSpeechMs:  250,    // shorter than this is a cough or a keystroke
  maxSegmentMs: 12000,  // hard stop, so one long utterance still gets sent
  idleFlushMs:  6000,   // recycle when nothing was said
  noiseFactor:  1.9,
  noiseMargin:  2.5,
  floorMin:     1.5,
  fftSize:      512,
}

/**
 * Watches a stream and reports when speech starts and when a segment ends.
 *
 * @param {object}      o
 * @param {MediaStream} o.stream
 * @param {object}     [o.levelRef]  written with the raw RMS every frame
 * @param {object}     [o.tuning]    overrides for VAD_DEFAULTS
 * @param {Function}   [o.now]       injectable clock, defaults to performance.now
 * @param {Function}   [o.log]       (event, data) => void
 *
 * @param {(e: {at: number}) => void} [o.onSpeechStart]
 *        Fires on the silent→speaking edge, BEFORE any text exists. This is the
 *        aggregator's most valuable input and the reason this file emits at all:
 *        "the speaker started again" is the one continuation signal that is free,
 *        instant and identical in every language.
 *
 * @param {(e: {seq: number, reason: string, speechStartedAt: number,
 *             speechEndedAt: number, speechMs: number, segmentMs: number,
 *             tooShort: boolean}) => void} [o.onSegmentEnd]
 *        `reason` is 'silence' | 'max-segment' | 'idle'. One callback with a
 *        reason rather than the three separate callbacks first sketched: both
 *        callers do the same thing for the first two (close the segment) and the
 *        distinction is only worth logging.
 *
 *        speechEndedAt is when the level last CROSSED the threshold, not when the
 *        timer fired. The aggregator measures gaps between utterances, and a gap
 *        measured to the timer would carry silenceMs of padding on one side only.
 *
 * @returns {{ stop(): void, isSpeaking(): boolean }}
 */
export function createSilenceDetector({
  stream, levelRef, tuning, now: nowFn, log,
  onSpeechStart, onSegmentEnd,
}) {
  const cfg = { ...VAD_DEFAULTS, ...(tuning || {}) }
  const now = nowFn || (() => performance.now())

  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = cfg.fftSize
  ctx.createMediaStreamSource(stream).connect(analyser)

  const data = new Uint8Array(analyser.fftSize)

  let stopped = false
  let raf = 0
  let silenceTimer = null

  let speaking = false
  let noiseFloor = 0
  let lastTick = now()

  // Per-segment accumulators. Reset by endSegment() at the instant it emits,
  // rather than in the caller's recorder.onstop as before: onstop is a task or
  // two later, and any frame in between could set sawSpeech on the segment that
  // was already closed, whose speech was then discarded by the reset.
  let seq = 0
  let sawSpeech = false
  let speechMs = 0
  let segmentStart = lastTick
  let speechStartedAt = 0
  let lastSpeechAt = 0

  const clearSilence = () => {
    if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null }
  }

  const endSegment = (reason) => {
    clearSilence()
    const at = now()
    const e = {
      seq: seq++,
      reason,
      speechStartedAt,
      speechEndedAt: lastSpeechAt || at,
      speechMs,
      segmentMs: at - segmentStart,
      tooShort: speechMs < cfg.minSpeechMs,
    }

    speaking = false
    sawSpeech = false
    speechMs = 0
    segmentStart = at
    speechStartedAt = 0
    lastSpeechAt = 0

    log?.('segment-end', {
      seq: e.seq, reason, speechMs: Math.round(e.speechMs),
      segmentMs: Math.round(e.segmentMs), tooShort: e.tooShort,
    })
    onSegmentEnd?.(e)
  }

  const tick = () => {
    if (stopped) return

    const at = now()
    const dt = at - lastTick
    lastTick = at

    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      const d = data[i] - 128
      sum += d * d
    }
    const rms = Math.sqrt(sum / data.length)
    if (levelRef) levelRef.current = rms

    // Track the room. Rises slowly and falls fast, so a noisy stretch lifts the
    // bar gradually but the bar drops back as soon as the room quietens — the
    // opposite would let one loud moment deafen us for a minute.
    if (!speaking) {
      const alpha = rms < noiseFloor ? 0.25 : 0.02
      noiseFloor += (rms - noiseFloor) * alpha
    }
    const threshold = Math.max(cfg.floorMin, noiseFloor * cfg.noiseFactor + cfg.noiseMargin)

    if (rms > threshold) {
      if (!speaking) {
        speaking = true
        speechStartedAt = at
        log?.('speech-start', { at: Math.round(at), rms: Math.round(rms), threshold: Math.round(threshold) })
        onSpeechStart?.({ at })
      }
      sawSpeech = true
      speechMs += dt
      lastSpeechAt = at
      clearSilence()
    } else if (speaking && !silenceTimer) {
      silenceTimer = setTimeout(() => {
        silenceTimer = null
        endSegment('silence')
      }, cfg.silenceMs)
    }

    const age = at - segmentStart
    // A very long utterance would otherwise sit unsent until the speaker finally
    // pauses. useLiveVoice had no equivalent at all, so `pending` grew without
    // bound and nothing was ever committed.
    if (age > cfg.maxSegmentMs && sawSpeech) {
      endSegment('max-segment')
    } else if (!sawSpeech && age > cfg.idleFlushMs) {
      endSegment('idle')
    }

    raf = requestAnimationFrame(tick)
  }

  raf = requestAnimationFrame(tick)

  return {
    stop() {
      if (stopped) return
      stopped = true
      if (raf) { cancelAnimationFrame(raf); raf = 0 }
      clearSilence()
      // Chromium caps a page at 6 AudioContexts, and closing is what stops
      // capture dying after a few start/stop cycles.
      ctx.close().catch(() => {})
      if (levelRef) levelRef.current = 0
    },
    isSpeaking: () => speaking,
  }
}
