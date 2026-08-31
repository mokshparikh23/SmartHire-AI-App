import { useEffect } from 'react'
import { transcribe } from '../services/aiRouter'
import { useSessionStore } from '../store/sessionStore'
import { createSilenceDetector } from '../utils/silenceDetector'
import { createLogger } from '../utils/logger'
import { isEcho } from '../utils/speakerDedupe'
import { acquire } from './useVoice'

const log = createLogger('self')

/* SELF-VOICE 2026-08-31 ─────────────────────────────────────────────────────────
   THE CANDIDATE'S OWN VOICE. This is the fix for "short questions don't get full
   understanding", and it is a capture change rather than a prompt change.

   THE BUG. Until now exactly one audio stream existed: captureSource, defaulting
   to 'system' loopback — the OTHER side of the call. acquire() branches to
   getDisplayMedia OR getUserMedia, never both, and exactly one of useLiveVoice /
   useVoice runs at a time on that single stream.

   So nothing the candidate said out loud was ever captured, and the `assistant`
   entries in recentHistory() are the AI's own past SUGGESTIONS — which the
   candidate may have used, reworded, or ignored entirely. When the interviewer
   asks "why?" or "can you elaborate?", the antecedent is something the candidate
   said, and the model has never seen it. It resolves the follow-up against text
   that was never spoken in the room and answers confidently about the wrong
   thing. No amount of prompt wording fixes a fact that is not in the prompt.

   ── The four decisions, and why ────────────────────────────────────────────────

   1. A SECOND VAD, NOT A MIXED GRAPH. Mixing the two streams destroys the only
      thing that matters — which one a sample came from. createSilenceDetector
      already owns exactly one AudioContext per instance and closes it in stop(),
      so two instances is two of Chromium's six-context budget.

   2. THIS DOES NOT GO ON THE REALTIME PATH. useLiveVoice holds one
      RTCPeerConnection with one track, and the transcription deltas carry no
      speaker attribution — a second track is mixed or ignored, either way
      undiarised. Per-speaker live captioning would therefore need a SECOND
      realtime session: a second peer connection, a second ephemeral secret, and
      double the most expensive per-minute cost the product has. To caption
      something nobody reads. So the candidate's stream goes on the cheap HTTP
      transcribe path instead, and this decision is written down here so it does
      not get re-litigated as an oversight.

   3. BATCHED, NOT PER-PAUSE. One continuous MediaRecorder spans the candidate's
      whole turn and is stopped once, at harvest. Two reasons. Blobs from
      SEPARATE recorders cannot be concatenated — each carries its own webm
      container header — so a per-pause design would mean one upload per pause.
      And per-pause would roughly double the request count against the 600-per
      -session cap in the web app's metering, which could genuinely end an
      interview early. Batched adds about one request per interviewer turn.

   4. THE TRIGGER IS THE INTERVIEWER'S SPEECH-START EDGE. The instant they begin
      talking is the instant the candidate stopped — a free, exact signal that is
      already being detected for turn-taking. Harvesting there runs the upload
      concurrently with the interviewer still speaking AND with the aggregator's
      hold, so the text is in the store well before generate() fires. NOTHING IS
      AWAITED anywhere on that path: the "a COMPLETE question is never held"
      guarantee that scripts/segment-replay.mjs asserts is untouched.

   ── What this hook structurally cannot do ──────────────────────────────────────

   It has no reference to the question callback and no access to the aggregator.
   Its only output is appendSelfSpeech. The candidate's own voice therefore
   cannot trigger an answer — that is a property of the wiring, not a flag
   somebody has to remember to check.

   ── Why it is a new file rather than a parameter on useVoice ───────────────────

   useVoice's segment-per-pause behaviour is what the ANSWER path depends on, and
   it must not be perturbed while fixing something else. What is duplicated here
   is about forty lines of recorder lifecycle; what is SHARED — and shared on
   purpose — is acquire() and createSilenceDetector, which is where all the
   measured constants live.

   ── Echo, when the candidate is on speakers ────────────────────────────────────

   Three layers, cheapest first. See utils/speakerDedupe.js for the full argument.
     1. getUserMedia's echoCancellation: true, in acquire(). Load-bearing — do
        NOT "align" it with the loopback branch's echoCancellation: false.
     2. The temporal gate below: self speech that BEGINS while the interviewer is
        speaking is discarded outright.
     3. Text overlap, as a backstop.
   And headphones make all three moot, which is why the UI says so.

   @param {boolean}  enabled
   @param {object}   remoteSpeakingRef  ref, true while the interviewer is talking
   @param {object}   harvestRef         out-param: filled with harvest()
   @param {Function} onSelfSpeech       (text) => void
   @param {object}   recentRemoteRef    ref to the last few [HEARD] lines
*/

// Same as useVoice: speech-rate opus, and a 250ms ondataavailable cadence.
const AUDIO_BITS_PER_SECOND = 32000
const TIMESLICE_MS = 250
const MIN_BLOB_BYTES = 800

/* A candidate can talk for a long time without being interrupted — a
   "tell me about yourself" answer runs minutes. Harvest on our own schedule too,
   so one turn never becomes one enormous upload. */
const MAX_PENDING_MS = 45000

/* Never two self uploads in flight. This is context, not the critical path; if
   one is still going when the next harvest comes due, skip rather than queue. */
const HARVEST_MIN_GAP_MS = 1200

export function useSelfVoice({
  enabled, remoteSpeakingRef, harvestRef, onSelfSpeech, recentRemoteRef,
}) {
  useEffect(() => {
    if (!enabled) {
      if (harvestRef) harvestRef.current = null
      return
    }

    let cancelled = false
    const own = { stream: null, rec: null, vad: null, maxTimer: 0 }

    let chunks = []
    let sawSpeech = false
    /* The temporal gate. Set when speech STARTS while the interviewer is
       talking; that whole recording is then discarded rather than uploaded.
       Suppressing a genuine interruption is the correct trade: [SAID] is context
       only, and losing one line is strictly better than attributing the
       interviewer's words to the candidate. */
    let bleed = false
    let uploading = false
    let lastHarvestAt = 0

    const release = () => {
      // An interval, not a timeout — see MAX_PENDING_MS below.
      if (own.maxTimer) { clearInterval(own.maxTimer); own.maxTimer = 0 }
      own.vad?.stop()
      own.vad = null
      if (own.rec?.state === 'recording') { try { own.rec.stop() } catch { /* already stopped */ } }
      own.rec = null
      own.stream?.getTracks().forEach((t) => t.stop())
      own.stream = null
    }

    /**
     * Stop the recorder, upload what it holds, restart it. Never awaited by any
     * caller — see decision 4 in the header.
     */
    const harvest = (why) => {
      if (cancelled || !own.rec || uploading) return
      if (!sawSpeech) return                       // nothing was said
      const at = Date.now()
      if (at - lastHarvestAt < HARVEST_MIN_GAP_MS) return
      lastHarvestAt = at

      sawSpeech = false
      log('harvest', { why })
      // onstop does the work; stopping is all this has to do.
      if (own.rec.state === 'recording') { try { own.rec.stop() } catch { /* raced */ } }
    }

    if (harvestRef) harvestRef.current = harvest

    const run = async () => {
      let stream
      try {
        // Always 'mic' — this is the COMPLEMENT of the primary capture, which
        // this hook is only enabled for when the primary is system loopback.
        stream = await acquire('mic')
      } catch (e) {
        /* Deliberately quiet. The candidate's own voice is an enhancement: if it
           cannot be captured, every answer still works and simply has less
           context. Writing captureState here would paint the panel "deaf" over a
           perfectly healthy interviewer capture, which would be a worse lie than
           the one this whole change is fixing. */
        console.warn('[self] microphone unavailable, continuing without self-context:', e.message)
        return
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
      own.stream = stream

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND })
      own.rec = recorder

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType })
        const wasBleed = bleed
        chunks = []
        bleed = false

        // Straight back to recording, exactly as useVoice does: the gap between
        // stop and start is the only window in which audio is lost.
        if (!cancelled) { try { recorder.start(TIMESLICE_MS) } catch { /* raced */ } }

        if (cancelled || blob.size <= MIN_BLOB_BYTES) return
        if (wasBleed) { log('bleed-drop', { bytes: blob.size }); return }

        uploading = true
        const { sessionId } = useSessionStore.getState()
        transcribe(blob, 'self.webm', sessionId)
          .then((text) => {
            const clean = (text || '').trim()
            if (cancelled || !clean) return
            // Layer 3: the text backstop, against what AEC and the temporal gate
            // both let through.
            if (isEcho(clean, recentRemoteRef?.current || [])) {
              log('echo-drop', { text: clean.slice(0, 60) })
              return
            }
            log('text', { chars: clean.length })
            onSelfSpeech?.(clean)
          })
          .catch((e) => {
            // Quiet for the same reason acquire() above is quiet.
            console.warn('[self] transcription failed:', e.message)
          })
          .finally(() => { uploading = false })
      }

      recorder.start(TIMESLICE_MS)

      own.vad = createSilenceDetector({
        stream,
        log,
        onSpeechStart: () => {
          if (cancelled) return
          // Layer 2. Speech that BEGINS while the interviewer is talking is the
          // interviewer's own voice coming back in through the speakers.
          if (remoteSpeakingRef?.current) { bleed = true; return }
          sawSpeech = true
        },
        onSegmentEnd: () => { /* segments are not the unit here — turns are */ },
      })

      // Our own ceiling, so a long uninterrupted answer is not one huge blob.
      // An interval, not a timeout: a "tell me about yourself" answer can run
      // several minutes and needs harvesting more than once.
      own.maxTimer = setInterval(() => harvest('max-pending'), MAX_PENDING_MS)
    }

    run()

    return () => {
      cancelled = true
      if (harvestRef) harvestRef.current = null
      release()
    }
  }, [enabled, remoteSpeakingRef, harvestRef, onSelfSpeech, recentRemoteRef])
}
