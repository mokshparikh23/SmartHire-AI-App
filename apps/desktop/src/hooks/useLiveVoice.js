import { useEffect } from 'react'
import { openRealtimeCall } from '../services/aiRouter'
import { useSessionStore } from '../store/sessionStore'
import { createSilenceDetector } from '../utils/silenceDetector'
import { createLogger } from '../utils/logger'
import { acquire } from './useVoice'

const log = createLogger('vad-live')

/**
 * Live captioning: text appears while the person is still speaking.
 *
 * Sits BESIDE useVoice rather than replacing it. Both are mounted; exactly one
 * runs, and this one hands over to the other on any failure. That is deliberate
 * — the worst outcome of this whole feature should be the app as it was.
 *
 * @param {boolean}  enabled
 * @param {string}   source      'system' | 'mic', same values acquire() takes
 * @param {object}   aggRef      ref holding the shared utterance aggregator.
 *                               SEGMENTATION 2026-08-30: this replaced
 *                               onQuestion. Deciding when a question has ENDED
 *                               is no longer this file's job — it reports
 *                               fragments and speech edges, and the aggregator
 *                               owns the policy for both capture paths.
 * @param {Function} onPartial   called on every delta with the text so far
 * @param {Function} onUnsupported  called when this path cannot run, so the
 *                                  caller can start useVoice instead
 * @param {object}   levelRef    live RMS, same contract as useVoice
 */

/* LIVE CAPTION 2026-08-30 ─────────────────────────────────────────────────────
   WHY THERE IS STILL A VAD IN HERE.

   The obvious design is server-side turn detection: let OpenAI tell us when a
   sentence ended, via conversation.item.input_audio_transcription.completed.
   That is not available on this model. Minting with turn_detection returns

     400 "Turn detection is not supported for this transcription model."

   and the models that DO accept it (gpt-4o-transcribe, gpt-4o-mini-transcribe)
   were measured emitting every delta in one burst AFTER the speaker stops — a
   fast dump, not a caption. Since the caption is the feature, the live model
   wins and turn detection comes back to us.

   So the analyser loop below is the same one useVoice has always run, doing the
   same job it always did — deciding when someone stopped talking. What changed
   is only what that decision drives: no MediaRecorder, no blob, no upload. It
   commits the text the deltas already delivered. */

/* SEGMENTATION 2026-08-30: all six constants moved out.

   The three VAD numbers now live in utils/silenceDetector.js, which is the same
   analyser loop this file and useVoice.js each ran a private copy of. That
   extraction is also what finally gives this path MAX_SEGMENT_MS and
   MIN_SPEECH_MS — it never had either, so a speaker who stayed above threshold
   never committed at all, and a cough committed 700ms later.

   MIN_TEXT_CHARS and FILLER moved to utils/utterance.js, where they became
   script-aware and multilingual. The copies below were byte-identical to
   useVoice's and both were English-only, so "haan" and "ठीक है" each bought a
   full metered answer. */
// const SILENCE_MS   = 700   // matches useVoice; a sentence is closed after this
// const MIN_TEXT_CHARS = 3
// const FILLER = /^(thank you|thanks|okay|ok|yes|no|yeah|hmm+|uh+|um+|mm+|\.+)$/i

// Same shape as useVoice's noise tracking, and for the same reason: microphone
// and playback gain vary enormously, so the trigger is measured rather than set.
// const NOISE_FACTOR = 1.9
// const NOISE_MARGIN = 2.5
// const FLOOR_MIN    = 1.5

// A 501 from our own backend means the server is on Gemini. Not an error to
// show anyone — just a reason to use the other path.
const UNSUPPORTED = 'realtime_unsupported'

/* PIPELINE 2026-08-31 ─ two hangs that had no deadline ───────────────────────
   ICE_TIMEOUT_MS: oniceconnectionstatechange below only handed over on
   'failed'. On a restrictive network ICE sits in 'checking' indefinitely and
   never reaches 'failed' at all — a silent, permanent hang with the panel still
   reading "listening" and no audio path running anywhere.

   REALTIME_TIMEOUT_MS: openRealtimeCall had no timeout either, so a hung SDP
   POST left run() awaiting forever with own.pc set. The abort lands in the
   catch below, which already calls giveUp — exactly the right handover. */
const ICE_TIMEOUT_MS = 8000
const REALTIME_TIMEOUT_MS = 10000

// export function useLiveVoice({
//   enabled, source = 'system', onQuestion, onPartial, onUnsupported, levelRef,
// }) {
export function useLiveVoice({
  enabled, source = 'system', aggRef, onPartial, onUnsupported, levelRef,
}) {
  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    // SEGMENTATION 2026-08-30: ctx/raf/silence moved into the shared detector,
    // which owns the AudioContext and its own teardown.
    // const own = { stream: null, pc: null, ctx: null, raf: 0, silence: null }
    // PIPELINE 2026-08-31: iceTimer joins the bag so release() can clear it on
    // every exit path, including the effect teardown.
    // const own = { stream: null, pc: null, vad: null }
    const own = { stream: null, pc: null, vad: null, iceTimer: 0 }

    /** Text accumulated from deltas since the last segment closed. */
    let pending = ''

    const release = () => {
      // PIPELINE 2026-08-31: an armed ICE timer that outlives the connection
      // would call giveUp() on a session that had already moved on.
      if (own.iceTimer) { clearTimeout(own.iceTimer); own.iceTimer = 0 }
      own.vad?.stop()
      own.vad = null
      try { own.pc?.close() } catch { /* already closed */ }
      own.pc = null
      own.stream?.getTracks().forEach((t) => t.stop())
      own.stream = null
      if (levelRef) levelRef.current = 0
    }

    /* SEGMENTATION 2026-08-30 ─ commit() is gone, and this is the whole change.

       It used to drop the filler, apply the length floor and call onQuestion —
       i.e. it decided, right here, that a 700ms silence meant the question was
       over. That is the reported bug: "So what is" [pause] "tell me about class"
       was two commits and two answers.

       Both jobs moved. The gates are in utils/utterance.js and the end-of-turn
       decision is in utils/utteranceAggregator.js, shared with useVoice so the
       two paths cannot disagree about what a question is.

       const commit = () => {
         const text = pending.trim()
         pending = ''
         onPartial?.('')
         if (!text || text.length < MIN_TEXT_CHARS) return
         if (FILLER.test(text)) return
         onQuestion(text)
       }  */

    /** Hands the deltas gathered so far to the aggregator as ONE fragment. */
    const pushFragment = (meta) => {
      const text = pending
      pending = ''
      /* NOT onPartial('') any more. Blanking here wiped the caption at every
         fragment boundary — which, during a hold, erases "So what is" from the
         screen while the user is still mid-question. The aggregator drives the
         caption through onHoldChange instead, so a held fragment stays visible
         and the wait reads as deliberate rather than as a dropped question. */
      aggRef?.current?.pushFragment(text, meta)
    }

    const giveUp = (reason, err) => {
      if (cancelled) return
      console.warn('[live] falling back to segmented transcription:', reason, err?.message || '')
      release()
      onUnsupported?.(reason)
    }

    const run = async () => {
      let stream
      try {
        stream = await acquire(source)
      } catch (e) {
        /* PIPELINE 2026-08-31 ─ this `return` left the session completely deaf ──
           The reasoning below — "useVoice would fail on exactly the same call" —
           holds only for a permission denial. It is false for getDisplayMedia
           resolving with no audio track (that throw is loopback-specific and
           lives in useVoice's own acquire), for a transient NotReadableError
           while another app holds the device, and for an AbortError.

           And the cost of being wrong was total: returning without calling
           onUnsupported leaves liveFailed false, so useInterviewSession keeps
           this hook "enabled" having done nothing, and useVoice — gated on
           liveFailed being TRUE — never starts either. The result is a running,
           billing session with NO audio path at all and a green meter chip,
           recoverable only by ending the interview.

           Even when the failure genuinely is identical, handing over costs one
           extra acquire() and then sets the same error string. Strictly better
           than a dead session. */
        // console.error(`[live] ${source} capture unavailable:`, e.message)
        // if (!cancelled) { useSessionStore.getState().setError(…) }
        // return
        console.error(`[live] ${source} capture unavailable:`, e.message)
        if (!cancelled) {
          useSessionStore.getState().setCaptureState('failed',
            source === 'system'
              ? `System audio could not be captured. ${e.message}`
              : `The microphone could not be opened. ${e.message}`
          )
        }
        giveUp('capture failed', e)
        return
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
      own.stream = stream
      // PIPELINE 2026-08-31: capture is genuinely running, so the panel may say
      // "listening" honestly. Before this, nothing ever confirmed it.
      useSessionStore.getState().setCaptureState('live')

      // The loopback track dies when the output device changes. Same failure and
      // same fix as useVoice, but here the peer connection dies with it, so the
      // cheapest correct response is to hand over rather than renegotiate.
      stream.getAudioTracks().forEach((t) => {
        t.onended = () => giveUp('capture track ended')
      })

      // ── WebRTC ──────────────────────────────────────────────────────────────
      let pc
      try {
        pc = new RTCPeerConnection()
        own.pc = pc
        pc.addTrack(stream.getAudioTracks()[0], stream)

        // OpenAI's realtime events arrive on a channel with this exact name.
        const events = pc.createDataChannel('oai-events')
        events.onmessage = (e) => {
          if (cancelled) return
          let msg
          try { msg = JSON.parse(e.data) } catch { return }

          if (msg.type?.endsWith('input_audio_transcription.delta')) {
            // Verified monotonic: joined deltas equal the final transcript
            // character-for-character, so appending is safe and the caption
            // does not rewrite itself mid-sentence.
            pending += msg.delta || ''
            onPartial?.(pending)
          } else if (msg.type === 'error') {
            console.warn('[live] server error:', JSON.stringify(msg).slice(0, 300))
          }
        }

        /* PIPELINE 2026-08-31: 'checking' is not a terminal state and never
           becomes 'failed' on some networks, so waiting only for 'failed' meant
           waiting forever. Arm a deadline and disarm it the moment the
           connection is genuinely up. */
        // pc.oniceconnectionstatechange = () => {
        //   if (pc.iceConnectionState === 'failed') giveUp('ice failed')
        // }
        own.iceTimer = setTimeout(() => {
          own.iceTimer = 0
          giveUp(`ice stuck in ${pc.iceConnectionState}`)
        }, ICE_TIMEOUT_MS)

        pc.oniceconnectionstatechange = () => {
          const state = pc.iceConnectionState
          if (state === 'connected' || state === 'completed') {
            if (own.iceTimer) { clearTimeout(own.iceTimer); own.iceTimer = 0 }
            return
          }
          if (state === 'failed') giveUp('ice failed')
        }

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        // PIPELINE 2026-08-31: a deadline on the SDP exchange. Aborting here
        // lands in the catch below, which already hands over.
        // const { answer } = await openRealtimeCall(offer.sdp, useSessionStore.getState().sessionId)
        const sdpGuard = new AbortController()
        const sdpTimer = setTimeout(() => sdpGuard.abort(), REALTIME_TIMEOUT_MS)
        let answer
        try {
          ;({ answer } = await openRealtimeCall(
            offer.sdp, useSessionStore.getState().sessionId, sdpGuard.signal,
          ))
        } finally {
          clearTimeout(sdpTimer)
        }
        if (cancelled) return
        await pc.setRemoteDescription({ type: 'answer', sdp: answer })
      } catch (e) {
        // 501 means the server is on Gemini; anything else is a genuine failure.
        // Both end the same way, because both mean this path cannot serve.
        giveUp(e?.code === UNSUPPORTED ? 'provider does not support realtime' : 'connect failed', e)
        return
      }

      // ── Turn detection ──────────────────────────────────────────────────────
      /* SEGMENTATION 2026-08-30: the analyser loop that used to live here was
         byte-identical to useVoice's, and is now utils/silenceDetector.js. The
         comment it carried about delta lag still applies and has moved to
         onSegmentEnd below, because it is still the reason this works. */
      own.vad = createSilenceDetector({
        stream,
        levelRef,
        log,
        onSpeechStart: ({ at }) => {
          if (cancelled) return
          aggRef?.current?.noteSpeechStart(at)
        },
        onSegmentEnd: (meta) => {
          if (cancelled) return

          // Tell the aggregator the speaker stopped BEFORE handing over the
          // text. On this path the two are the same instant, but the aggregator
          // treats the edges and the content as separate inputs precisely so the
          // segmented path — where the transcript lands ~700ms later — behaves
          // identically.
          aggRef?.current?.noteSpeechEnd(meta.speechEndedAt)

          // An idle recycle carries no speech, and a sub-threshold blip is a
          // cough or a keystroke. Neither is a fragment. MIN_SPEECH_MS never
          // existed on this path before the detector was shared.
          if (meta.reason === 'idle' || meta.tooShort) {
            pending = ''
            // A cough can still have produced a delta or two. Clear the caption
            // so a stray syllable is not left painted over the committed
            // question — the aggregator will not be told about this one, so
            // nothing else is going to clear it.
            onPartial?.('')
            return
          }

          // The deltas for the tail of a sentence land slightly after the audio
          // does, so committing on the exact silence edge would clip the last
          // word or two. silenceMs is longer than the observed delta lag, so by
          // here the text has caught up.
          pushFragment(meta)
        },
      })
    }

    run()

    return () => {
      cancelled = true
      release()
    }
    // SEGMENTATION 2026-08-30: aggRef is a ref object, so its identity is stable
    // and it cannot retear the capture. That is why the aggregator is created in
    // useInterviewSession and passed down rather than built in here — a value
    // that changed identity in this array would re-acquire the device.
    // }, [enabled, source, onQuestion, onPartial, onUnsupported, levelRef])
  }, [enabled, source, aggRef, onPartial, onUnsupported, levelRef])
}
