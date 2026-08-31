import { useEffect } from 'react'
import { transcribe } from '../services/aiRouter'
import { useSessionStore } from '../store/sessionStore'
import { createSilenceDetector } from '../utils/silenceDetector'
import { createLogger } from '../utils/logger'

const log = createLogger('vad-seg')

/**
 * Audio capture with voice-activity detection. Pure audio → text: it owns no AI
 * calls, so it can be mounted once high in the tree and never torn down
 * mid-session. Its only store write is a capture failure — see acquire().
 *
 * @param {boolean}  enabled     start/stop capture
 * @param {string}   source      'system' (loopback) or 'mic'
 * @param {object}   aggRef      SEGMENTATION 2026-08-30: replaced onQuestion.
 *                               This hook no longer decides when a question has
 *                               ended — it reports transcribed fragments and
 *                               speech edges to the shared aggregator, which
 *                               owns that policy for both capture paths.
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
/* SEGMENTATION 2026-08-30: these four moved to utils/silenceDetector.js with
   their values unchanged — VAD_DEFAULTS there is this block, verbatim. The note
   above still explains why each number is what it is, and is why it stays here
   rather than moving with them: 700 is still the base, and the reasoning is what
   a future reader needs when they wonder why the hold in the aggregator is added
   ON TOP of it rather than replacing it. */
// const SILENCE_MS      = 1200
// const SILENCE_MS      = 700    // silence before an utterance is closed
// const MIN_SPEECH_MS   = 250    // shorter than this is a cough or a keystroke
// const MAX_SEGMENT_MS  = 25000
// const MAX_SEGMENT_MS  = 12000  // hard stop, so one long answer still gets sent
// const IDLE_FLUSH_MS   = 6000   // recycle the recorder when nothing was said

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
const TIMESLICE_MS    = 250    // ondataavailable cadence while recording

// Speech has to clear the measured noise floor by this much. Multiplicative so
// it scales with gain, plus a small absolute term so a near-silent room does
// not make the threshold zero.
// SEGMENTATION 2026-08-30: moved to utils/silenceDetector.js, unchanged.
// const NOISE_FACTOR = 1.9
// const NOISE_MARGIN = 2.5
// const FLOOR_MIN    = 1.5

/* MULTILINGUAL 2026-08-30: MIN_TEXT_CHARS and FILLER moved to
   utils/utterance.js, where the aggregator applies them for both capture paths.

   The copies were English-only, so every Hindi and Gujarati acknowledgement
   bought a full metered answer. The length floor also counted UTF-16 code units,
   which means something different in every script — "हाँ" is three of them and
   one syllable. Both are fixed there, once. */
// const MIN_TEXT_CHARS  = 3
// const FILLER = /^(thank you|thanks|okay|ok|yes|no|yeah|hmm+|uh+|um+|mm+|\.+)$/i

// A loopback track dies whenever the output device changes — headphones in or
// out, AirPods connecting — and never comes back on its own. Restarts are
// capped so a permanently dead device cannot spin here forever.
const RESTART_DELAY_MS = 500
const MAX_RESTARTS     = 5
const RESTART_RESET_MS = 30000  // capture alive this long clears the budget

/* PIPELINE 2026-08-31 ─ the serial chain had no way to fail ──────────────────
   Serialising transcription (see the note at transcribeChain below) is correct,
   but the chain had no deadline and no bound. transcribe() passed no signal at
   all, so ONE never-settling upload — dead Wi-Fi, a server holding the socket —
   blocked every later segment for the rest of the session. The .catch there
   handles a rejection; nothing handles a promise that never settles. The
   segmented path simply went mute, permanently, with no error anywhere.

   TRANSCRIBE_TIMEOUT_MS: the request carries at most 12s of 32 kbps opus (~48
   KB) and turns around in ~0.5-2s measured. The server's own retry budget on
   that route is ~25s, so at 20s we may abandon a request it would eventually
   have answered — that is the right trade. A transcript landing 25s after it
   was spoken is useless mid-interview, and the NEXT segment matters more.

   MAX_PENDING_TRANSCRIPTS: with the timeout above this caps worst-case lag at
   3 x 20s and lets the queue self-drain instead of growing without bound.

   MAX_TRANSCRIBE_FAILURES: handleUtterance only console.error'd, so a
   consistently failing upload path was invisible. Consecutive, so a single blip
   stays quiet. */
const TRANSCRIBE_TIMEOUT_MS    = 20000
const MAX_PENDING_TRANSCRIPTS  = 3
const MAX_TRANSCRIBE_FAILURES  = 3

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

// export function useVoice({ enabled, source = 'system', onQuestion, levelRef }) {
export function useVoice({ enabled, source = 'system', aggRef, levelRef }) {
  useEffect(() => {
    if (!enabled) return

    // Guards every async continuation below. Without it, a session stopped
    // while acquire() is still resolving leaks a live capture.
    let cancelled = false
    // SEGMENTATION 2026-08-30: ctx/raf/silence moved into the shared detector.
    // const own = { stream: null, rec: null, ctx: null, raf: 0, silence: null, stable: null }
    const own = { stream: null, rec: null, vad: null, stable: null }

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
      own.vad?.stop()
      own.vad = null
      if (own.stable) { clearTimeout(own.stable); own.stable = null }
      if (own.rec?.state === 'recording') { try { own.rec.stop() } catch { /* already stopped */ } }
      own.rec = null
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
          /* PIPELINE 2026-08-31: setError -> setCaptureState. `error` is cleared
             by the next setQuestion and by clearAnswer, so this message — the
             single most likely first-run failure on macOS — was wiped by the
             next thing that happened, leaving a green "listening" chip over a
             capture that had never started. captureState survives, and it is
             what the panel now reads to say "deaf" instead of "listening". */
          // useSessionStore.getState().setError(…)
          useSessionStore.getState().setCaptureState('failed',
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
      // PIPELINE 2026-08-31: capture is genuinely running. Nothing confirmed
      // this before, which is why the meter chip could read green over a dead
      // device for a whole interview.
      useSessionStore.getState().setCaptureState('live')

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
            // PIPELINE 2026-08-31: same reason as the acquire() failure above —
            // this is the point where capture is permanently dead for the rest
            // of the session, and it was reported into a field the next question
            // silently cleared.
            // useSessionStore.getState().setError(…)
            useSessionStore.getState().setCaptureState('failed',
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
      /* SEGMENTATION 2026-08-30: sawSpeech/speechMs/segmentStart moved into the
         shared detector, which now reports them on onSegmentEnd. `pendingMeta`
         is what carries that report across the async gap to recorder.onstop —
         stop() is called from the detector's callback, onstop fires a task or
         two later, and the two have to be paired. */
      // let sawSpeech = false
      // let speechMs = 0
      // let segmentStart = performance.now()
      let pendingMeta = null

      /* SEGMENTATION 2026-08-30 ─ transcription is now SERIALISED.

         handleUtterance was fired and forgotten per segment, so two uploads
         could be in flight and resolve in EITHER ORDER. genRef in
         useInterviewSession hid that by answering whichever landed last, which
         is why it was never noticed.

         It stops being invisible the moment fragments are joined: a question
         split across a pause would be assembled backwards. One chain, so the
         aggregator sees fragments in the order they were spoken. */
      let transcribeChain = Promise.resolve()
      // PIPELINE 2026-08-31: how many uploads are queued or in flight, and how
      // many have failed back to back. See the constants at the top of the file.
      let pendingTranscripts = 0
      let transcribeFailures = 0

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType })
        const meta = pendingMeta
        // `tooShort` is the detector's MIN_SPEECH_MS check, applied identically
        // on both capture paths now rather than only on this one.
        const worthSending = !!meta && !meta.tooShort && meta.reason !== 'idle'
          && blob.size > MIN_BLOB_BYTES

        chunks = []
        pendingMeta = null

        // onstop also fires during teardown. Transcribing that tail would cost
        // an extra API call and surface a phantom question after "Stop".
        // SYSTEM-AUDIO 2026-08-30: myRun covers the other teardown — a device
        // change restarting capture — where `cancelled` is still false.
        if (cancelled || myRun !== runSeq) return

        // if (worthSending) handleUtterance(blob)
        // if (worthSending) {
        //   transcribeChain = transcribeChain
        //     .then(() => handleUtterance(blob, meta))
        //     .catch(() => { /* one failed utterance must not break the chain */ })
        // }
        /* PIPELINE 2026-08-31: bound the queue. Above the cap the newest blob is
           dropped rather than queued — with a 20s deadline on each upload, a
           backlog deeper than this is a network that is not coming back, and
           queueing more only pushes every later fragment further out of date. */
        if (worthSending && pendingTranscripts >= MAX_PENDING_TRANSCRIPTS) {
          log('transcribe-drop', { pending: pendingTranscripts, bytes: blob.size })
        } else if (worthSending) {
          pendingTranscripts++
          transcribeChain = transcribeChain
            .then(() => handleUtterance(blob, meta))
            .catch(() => { /* one failed utterance must not break the chain */ })
            .finally(() => { pendingTranscripts-- })
        }

        // Straight back to recording. The gap between stop and start is the only
        // window in which audio is lost, and it is a single frame.
        try { recorder.start(TIMESLICE_MS) } catch { /* already restarted */ }
      }

      const handleUtterance = async (blob, meta) => {
        try {
          // The recorder produces webm; the server strips the codec suffix and
          // passes the container through to whichever provider is configured.
          // SESSION GATE 2026-08-29: /api/ai/transcribe gates on sessionId too,
          // so without this every utterance came back 402. Read from the store
          // at call time, NOT taken as a prop — a changing prop would tear down
          // and re-acquire the microphone mid-session.
          const { sessionId } = useSessionStore.getState()
          // PIPELINE 2026-08-31: a deadline, so one hung upload cannot hold the
          // whole serial chain — and every segment behind it — forever.
          // const text = await transcribe(blob, 'audio.webm', sessionId)
          const guard = new AbortController()
          const timer = setTimeout(() => guard.abort(), TRANSCRIBE_TIMEOUT_MS)
          let text
          try {
            text = await transcribe(blob, 'audio.webm', sessionId, guard.signal)
          } finally {
            clearTimeout(timer)
          }
          if (cancelled) return

          // PIPELINE 2026-08-31: a success clears the streak, so a single blip
          // never accumulates toward the warning below.
          transcribeFailures = 0

          const clean = text?.trim()
          // SEGMENTATION 2026-08-30: the length floor and the filler gate moved
          // into the aggregator, which applies the multilingual, script-aware
          // versions from utils/utterance.js to both capture paths.
          // if (!clean || clean.length < MIN_TEXT_CHARS) return
          // if (FILLER.test(clean)) return
          // window.electronAPI?.sendTranscript?.({ text: clean })
          // onQuestion(clean)
          aggRef?.current?.pushFragment(clean, meta)
        } catch (e) {
          console.error('[voice] transcription failed:', e.message)
          /* PIPELINE 2026-08-31: this used to be console.error and nothing else,
             so a transcription path that was failing every single time looked
             exactly like a room where nobody was talking. Surface it once the
             streak makes it a real fault rather than a blip. */
          transcribeFailures++
          if (!cancelled && transcribeFailures >= MAX_TRANSCRIBE_FAILURES) {
            useSessionStore.getState().setCaptureState('failed',
              'Speech could not be transcribed. Check the connection — questions are not being picked up.'
            )
          }
        }
      }

      // ── Voice-activity detection ──────────────────────────────────────────
      /* SEGMENTATION 2026-08-30: the analyser loop that used to live here is now
         utils/silenceDetector.js, shared with useLiveVoice. Same maths, same
         constants, same noise-floor asymmetry — the VAD 2026-08-30 note above
         still describes it, and the originals are kept commented there.

         What changed is only what the decision drives: instead of calling
         recorder.stop() and letting a 700ms silence stand for "the question
         ended", it reports the segment and the aggregator decides. */

      // Record from the first frame. The detector only decides what to KEEP.
      recorder.start(TIMESLICE_MS)

      own.vad = createSilenceDetector({
        stream,
        levelRef,
        log,
        onSpeechStart: ({ at }) => {
          if (cancelled || myRun !== runSeq) return
          aggRef?.current?.noteSpeechStart(at)
        },
        onSegmentEnd: (meta) => {
          if (cancelled || myRun !== runSeq) return

          /* The speaker has stopped, and this is the moment the aggregator's
             hold clock can start. It matters that this fires HERE rather than
             when the transcript arrives: on this path the text lands ~700ms
             later, and a hold that only began then would already have run down
             most of its budget on the upload. */
          aggRef?.current?.noteSpeechEnd(meta.speechEndedAt)

          pendingMeta = meta
          if (recorder.state === 'recording') recorder.stop()
        },
      })
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
    // SEGMENTATION 2026-08-30: aggRef is a ref object with stable identity, so
    // it cannot re-acquire the microphone the way a changing callback would.
    // }, [enabled, source, onQuestion, levelRef])
  }, [enabled, source, aggRef, levelRef])
}
