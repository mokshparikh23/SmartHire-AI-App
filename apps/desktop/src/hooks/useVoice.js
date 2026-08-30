import { useEffect } from 'react'
import { transcribe } from '../services/aiRouter'
import { useSessionStore } from '../store/sessionStore'

/**
 * Audio capture with voice-activity detection. Pure audio → text: it owns no AI
 * calls, so it can be mounted once high in the tree and never torn down
 * mid-session. Its only store write is a capture failure — see acquire().
 *
 * @param {boolean}  enabled     start/stop capture
 * @param {string}   source      'system' (loopback) or 'mic'
 * @param {Function} onQuestion  called with each transcribed utterance
 * @param {object}   levelRef    optional ref that receives the live RMS level.
 *                               A ref, not state — this updates ~60×/s and
 *                               would otherwise re-render the whole tree.
 */

/* VAD 2026-08-30 ───────────────────────────────────────────────────────────────
   Rewritten because it was dropping the start of every question and, on some
   machines, hearing nothing at all. Two separate faults:

   1. THE RECORDER STARTED ONLY AFTER SPEECH WAS ALREADY CONFIRMED.
      recorder.start() was called inside `if (rms > RMS_SPEAKING)`, so the first
      syllables were gone before the encoder existed — plus MediaRecorder's own
      startup latency on top. "How would you design a rate limiter?" arrived as
      "would you design a rate limiter?", and short questions fell under
      MIN_TEXT_CHARS and were dropped entirely.

      The recorder now runs CONTINUOUSLY and speech detection only decides
      whether a finished segment is worth transcribing. Nothing can be clipped
      because nothing waits to start.

   2. THE THRESHOLD WAS A FIXED NUMBER (rms > 12).
      Microphone gain varies enormously between machines and headsets. On a
      quiet built-in mic normal speech sits around 5–8, so 12 was never crossed
      and the app sat on "Listening for a question…" forever; on a hot mic room
      noise crossed it constantly. The floor is measured instead, continuously,
      and the trigger sits above whatever the room actually is. */

/* LATENCY 2026-08-30 ──────────────────────────────────────────────────────────
   Answers were arriving fast once the text existed; getting to the text was the
   slow half. Three of the numbers below were the reason.

   SILENCE_MS was a flat 1.2s added to EVERY utterance — nothing is sent until
   the speaker has been quiet that long, so it is a floor on the whole pipeline
   before a single byte is uploaded. 700ms still clears the pauses inside a
   sentence (natural mid-sentence gaps run 150-400ms) while returning half a
   second on every question.

   MAX_SEGMENT_MS was the tail risk rather than the average: a question asked
   without a real pause sent NOTHING for 25 seconds. 12s bounds that, and a
   question longer than 12s arrives in two parts instead of very late.

   MIN_BLOB_BYTES had to come down with the bitrate — see below. */
// const SILENCE_MS      = 1200
const SILENCE_MS      = 700    // silence before an utterance is closed
const MIN_SPEECH_MS   = 250    // shorter than this is a cough or a keystroke
// const MAX_SEGMENT_MS  = 25000
const MAX_SEGMENT_MS  = 12000  // hard stop, so one long answer still gets sent
const IDLE_FLUSH_MS   = 6000   // recycle the recorder when nothing was said

/* LATENCY 2026-08-30: measured, not guessed. The loopback tap is forced stereo
   at 48kHz — channelCount:1 is NOT honoured on it, and applyConstraints throws
   OverconstrainedError, so mono is simply not available — and MediaRecorder's
   default lands around 116 kbps. That is 100 KB for a 7-second question, sent
   up twice: once to our backend and again from there to the provider.

   audioBitsPerSecond IS honoured. 32 kbps measures at 28.1 kbps actual, roughly
   a quarter of the bytes, and stays well inside what Opus needs for speech.

   MIN_BLOB_BYTES moves with it, though by less than it first appears. Measured
   at 32 kbps, a segment of a given wall-clock length weighs:

     250ms -> 217 B    400ms -> 261 B    600ms -> 2637 B
     1s    -> 3519 B   2s    -> 7435 B

   The jump between 400ms and 600ms is MediaRecorder's own startup: below about
   half a second the blob is container header and nothing else. So the floor's
   real job is separating headers from audio, and 800 sits in the middle of that
   gap with margin on both sides.

   The old 2000 would mostly still have worked, because a segment always carries
   its SILENCE_MS tail and so is never as short as the speech inside it. It is
   lowered anyway for the case that has no tail — a MAX_SEGMENT_MS cut — and so
   the floor stops depending on a property of a different constant. */
const AUDIO_BITS_PER_SECOND = 32000
// const MIN_BLOB_BYTES  = 2000
const MIN_BLOB_BYTES  = 800    // below this there is no usable audio
const MIN_TEXT_CHARS  = 3
const TIMESLICE_MS    = 250    // ondataavailable cadence while recording

// Speech has to clear the measured noise floor by this much. Multiplicative so
// it scales with gain, plus a small absolute term so a near-silent room does
// not make the threshold zero.
const NOISE_FACTOR = 1.9
const NOISE_MARGIN = 2.5
const FLOOR_MIN    = 1.5

const FILLER = /^(thank you|thanks|okay|ok|yes|no|yeah|hmm+|uh+|um+|mm+|\.+)$/i

// A loopback track dies whenever the output device changes — headphones in or
// out, AirPods connecting — and never comes back on its own. Restarts are
// capped so a permanently dead device cannot spin here forever.
const RESTART_DELAY_MS = 500
const MAX_RESTARTS     = 5
const RESTART_RESET_MS = 30000  // capture alive this long clears the budget

/* SYSTEM-AUDIO 2026-08-30 ─────────────────────────────────────────────────────
   Which audio this hook listens to. Everything below acquire() is identical for
   both sources: the VAD, the recorder and the transcription path never learn
   where the stream came from.

   The three loopback details here are not in any documentation. They were
   established empirically in the Electron 28 -> 43 upgrade (4be5aa3), and each
   one is load-bearing. */
// LIVE CAPTION 2026-08-30: exported so useLiveVoice.js uses the SAME capture,
// not a second copy that drifts. Every constraint below was measured; a
// near-identical duplicate would silently lose one of them.
export async function acquire(source) {
  if (source !== 'system') {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
    })
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    // getDisplayMedia rejects outright if no video is requested, so a frame is
    // asked for purely to satisfy that and dropped on the next line. main's
    // setDisplayMediaRequestHandler answers this without showing a picker.
    video: { width: 1, height: 1, frameRate: 1 },

    // Explicit false IS honoured on the loopback track — the default is true
    // for all three. Leaving them on means double-processing: whatever is on
    // the other end of the call has already had AGC and noise suppression
    // applied by Zoom or Meet, and running it through Chromium's again audibly
    // smears the speech Whisper then has to read. Echo cancellation is
    // meaningless here anyway, since a loopback tap has no echo path.
    //
    // If quiet speakers start getting missed, autoGainControl: true is the
    // first knob to try — it costs level accuracy, not intelligibility.
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  })

  // The video track is ceremony. Stop it immediately or the app holds a live
  // screen capture — visible in the macOS menu bar — for the whole session.
  stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t) })

  // getDisplayMedia resolves with video and no audio when the tap is refused,
  // rather than rejecting. Without this the caller would sit on a silent stream
  // showing "Listening" forever.
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((t) => t.stop())
    throw new Error('No system audio track. macOS needs Screen Recording permission for this.')
  }

  return stream
}

export function useVoice({ enabled, source = 'system', onQuestion, levelRef }) {
  useEffect(() => {
    if (!enabled) return

    // Guards every async continuation below. Without it, a session stopped
    // while acquire() is still resolving leaks a live capture.
    let cancelled = false
    const own = { stream: null, rec: null, ctx: null, raf: 0, silence: null, stable: null }

    // SYSTEM-AUDIO 2026-08-30: restarts are counted across the whole effect, not
    // per stream, so a device that ends every track it hands out stops after
    // MAX_RESTARTS instead of retrying for the length of the session.
    let restarts = 0
    let restartTimer = null

    /* Identifies the live capture. recorder.onstop restarts the recorder by
       design — that is how one segment rolls into the next — so on a restart the
       OLD recorder's onstop would fire during teardown and call start() on a
       stream whose tracks are already stopped. Bumping this makes every handler
       from a superseded run inert instead of relying on that throw. */
    let runSeq = 0

    /** Releases the current stream's resources, leaving the effect alive. */
    const release = () => {
      runSeq++
      if (own.raf) { cancelAnimationFrame(own.raf); own.raf = 0 }
      if (own.silence) { clearTimeout(own.silence); own.silence = null }
      if (own.stable) { clearTimeout(own.stable); own.stable = null }
      if (own.rec?.state === 'recording') { try { own.rec.stop() } catch { /* already stopped */ } }
      own.rec = null
      own.ctx?.close().catch(() => {})
      own.ctx = null
      own.stream?.getTracks().forEach((t) => t.stop())
      own.stream = null
      if (levelRef) levelRef.current = 0
    }

    const run = async () => {
      const myRun = ++runSeq
      let stream
      try {
        stream = await acquire(source)
      } catch (e) {
        // BUGFIX 2026-08-30: this used to console.error and return, which left
        // the panel showing "Listening" over a capture that had never started.
        // On macOS a missing Screen Recording grant lands here every time, so
        // the single most likely first-run failure was also the most invisible.
        console.error(`[voice] ${source} capture unavailable:`, e.message)
        if (!cancelled) {
          useSessionStore.getState().setError(
            source === 'system'
              ? `System audio could not be captured. ${e.message}`
              : `The microphone could not be opened. ${e.message}`
          )
        }
        return
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      own.stream = stream

      /* SYSTEM-AUDIO 2026-08-30 ─ the track outliving the device ───────────────
         Plugging headphones in or out re-routes system output, and the loopback
         track attached to the old device ends. Nothing restarts it, so capture
         went permanently silent mid-call with the panel still reading
         "Listening". The mic path has never needed this — getUserMedia follows
         the default device — but it is harmless there, so both share it. */
      // A capture that survives this long is working, so the budget below is
      // for a device failing repeatedly — not for someone who changes
      // headphones six times across a two-hour call.
      own.stable = setTimeout(() => { restarts = 0 }, RESTART_RESET_MS)

      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          // stop() does not fire this event, so release() cannot re-enter here;
          // myRun covers the remaining case of a superseded run's track ending
          // on its own after a newer one is already live.
          if (cancelled || restartTimer || myRun !== runSeq) return
          if (restarts >= MAX_RESTARTS) {
            useSessionStore.getState().setError(
              'Audio capture keeps dropping. Check the output device and restart the session.'
            )
            return
          }
          restarts++
          console.warn(`[voice] ${source} track ended; restarting (${restarts}/${MAX_RESTARTS})`)
          release()
          restartTimer = setTimeout(() => {
            restartTimer = null
            if (!cancelled) run()
          }, RESTART_DELAY_MS)
        }
      })

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      // LATENCY 2026-08-30: without an explicit rate this defaults to ~116 kbps
      // on the stereo loopback track, four times what speech needs.
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      })
      own.rec = recorder

      let chunks = []
      // Whether the segment currently being recorded contained real speech.
      // Read in onstop, which is why it lives out here rather than in the tick.
      let sawSpeech = false
      let speechMs = 0
      let segmentStart = performance.now()

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType })
        const worthSending = sawSpeech && speechMs >= MIN_SPEECH_MS && blob.size > MIN_BLOB_BYTES

        chunks = []
        sawSpeech = false
        speechMs = 0
        segmentStart = performance.now()

        // onstop also fires during teardown. Transcribing that tail would cost
        // an extra API call and surface a phantom question after "Stop".
        // SYSTEM-AUDIO 2026-08-30: myRun covers the other teardown — a device
        // change restarting capture — where `cancelled` is still false.
        if (cancelled || myRun !== runSeq) return

        if (worthSending) handleUtterance(blob)

        // Straight back to recording. The gap between stop and start is the only
        // window in which audio is lost, and it is a single frame.
        try { recorder.start(TIMESLICE_MS) } catch { /* already restarted */ }
      }

      const handleUtterance = async (blob) => {
        try {
          // The recorder produces webm; the server strips the codec suffix and
          // passes the container through to whichever provider is configured.
          // SESSION GATE 2026-08-29: /api/ai/transcribe gates on sessionId too,
          // so without this every utterance came back 402. Read from the store
          // at call time, NOT taken as a prop — a changing prop would tear down
          // and re-acquire the microphone mid-session.
          const { sessionId } = useSessionStore.getState()
          const text = await transcribe(blob, 'audio.webm', sessionId)
          if (cancelled) return

          const clean = text?.trim()
          if (!clean || clean.length < MIN_TEXT_CHARS) return
          if (FILLER.test(clean)) return

          window.electronAPI?.sendTranscript?.({ text: clean })
          onQuestion(clean)
        } catch (e) {
          console.error('[voice] transcription failed:', e.message)
        }
      }

      // ── Voice-activity detection ──────────────────────────────────────────
      const ctx = new AudioContext()
      own.ctx = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(analyser)

      const data = new Uint8Array(analyser.fftSize)
      let speaking = false
      let noiseFloor = 0
      let lastTick = performance.now()

      // Record from the first frame. Everything below only decides what to KEEP.
      recorder.start(TIMESLICE_MS)

      const tick = () => {
        // A frame queued just before release() would otherwise run once more and
        // re-arm own.raf, resurrecting the loop against a closed AudioContext.
        if (cancelled || myRun !== runSeq) return

        const now = performance.now()
        const dt = now - lastTick
        lastTick = now

        analyser.getByteTimeDomainData(data)

        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const d = data[i] - 128
          sum += d * d
        }
        const rms = Math.sqrt(sum / data.length)
        if (levelRef) levelRef.current = rms

        // Track the room. Rises slowly and falls fast, so a noisy stretch lifts
        // the bar gradually but the bar drops back as soon as the room quietens
        // — the opposite would let one loud moment deafen us for a minute.
        if (!speaking) {
          const alpha = rms < noiseFloor ? 0.25 : 0.02
          noiseFloor += (rms - noiseFloor) * alpha
        }
        const threshold = Math.max(FLOOR_MIN, noiseFloor * NOISE_FACTOR + NOISE_MARGIN)

        if (rms > threshold) {
          speaking = true
          sawSpeech = true
          speechMs += dt
          if (own.silence) { clearTimeout(own.silence); own.silence = null }
        } else if (speaking && !own.silence) {
          own.silence = setTimeout(() => {
            speaking = false
            own.silence = null
            if (recorder.state === 'recording') recorder.stop()
          }, SILENCE_MS)
        }

        const age = now - segmentStart
        // A very long answer would otherwise sit in memory unsent until the
        // speaker finally pauses; cut it and let the next segment continue.
        if (recorder.state === 'recording' && age > MAX_SEGMENT_MS && sawSpeech) {
          if (own.silence) { clearTimeout(own.silence); own.silence = null }
          speaking = false
          recorder.stop()
        }
        // Nothing said for a while: recycle so silent chunks do not accumulate.
        else if (recorder.state === 'recording' && !sawSpeech && age > IDLE_FLUSH_MS) {
          recorder.stop()
        }

        own.raf = requestAnimationFrame(tick)
      }
      own.raf = requestAnimationFrame(tick)
    }

    run()

    return () => {
      cancelled = true
      // A restart already scheduled would otherwise fire after teardown and
      // re-acquire the device for a session that has ended.
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = null }
      // release() is the same teardown the restart path uses. Chromium caps a
      // page at 6 AudioContexts, and its ctx.close() is what stops capture
      // dying after a few start/stop cycles.
      release()
    }
    // `source` belongs here: switching it has to re-acquire, not keep the old
    // stream running under the new label.
  }, [enabled, source, onQuestion, levelRef])
}
