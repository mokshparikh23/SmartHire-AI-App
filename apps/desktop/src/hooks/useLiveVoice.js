import { useEffect } from 'react'
import { openRealtimeCall } from '../services/aiRouter'
import { useSessionStore } from '../store/sessionStore'
import { acquire } from './useVoice'

/**
 * Live captioning: text appears while the person is still speaking.
 *
 * Sits BESIDE useVoice rather than replacing it. Both are mounted; exactly one
 * runs, and this one hands over to the other on any failure. That is deliberate
 * — the worst outcome of this whole feature should be the app as it was.
 *
 * @param {boolean}  enabled
 * @param {string}   source      'system' | 'mic', same values acquire() takes
 * @param {Function} onQuestion  called ONCE per utterance, with the final text
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

const SILENCE_MS   = 700   // matches useVoice; a sentence is closed after this
const MIN_TEXT_CHARS = 3
const FILLER = /^(thank you|thanks|okay|ok|yes|no|yeah|hmm+|uh+|um+|mm+|\.+)$/i

// Same shape as useVoice's noise tracking, and for the same reason: microphone
// and playback gain vary enormously, so the trigger is measured rather than set.
const NOISE_FACTOR = 1.9
const NOISE_MARGIN = 2.5
const FLOOR_MIN    = 1.5

// A 501 from our own backend means the server is on Gemini. Not an error to
// show anyone — just a reason to use the other path.
const UNSUPPORTED = 'realtime_unsupported'

export function useLiveVoice({
  enabled, source = 'system', onQuestion, onPartial, onUnsupported, levelRef,
}) {
  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const own = { stream: null, pc: null, ctx: null, raf: 0, silence: null }

    /** Text accumulated from deltas since the last commit. */
    let pending = ''

    const release = () => {
      if (own.raf) { cancelAnimationFrame(own.raf); own.raf = 0 }
      if (own.silence) { clearTimeout(own.silence); own.silence = null }
      try { own.pc?.close() } catch { /* already closed */ }
      own.pc = null
      own.ctx?.close().catch(() => {})
      own.ctx = null
      own.stream?.getTracks().forEach((t) => t.stop())
      own.stream = null
      if (levelRef) levelRef.current = 0
    }

    /** Hands this utterance to the answer stage and resets the caption. */
    const commit = () => {
      const text = pending.trim()
      pending = ''
      onPartial?.('')
      if (!text || text.length < MIN_TEXT_CHARS) return
      if (FILLER.test(text)) return
      onQuestion(text)
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
        // Capture failing is NOT a reason to fall back — useVoice would fail on
        // exactly the same call. Report it the way useVoice does and stop.
        console.error(`[live] ${source} capture unavailable:`, e.message)
        if (!cancelled) {
          useSessionStore.getState().setError(
            source === 'system'
              ? `System audio could not be captured. ${e.message}`
              : `The microphone could not be opened. ${e.message}`
          )
        }
        return
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
      own.stream = stream

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

        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === 'failed') giveUp('ice failed')
        }

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        const { answer } = await openRealtimeCall(offer.sdp, useSessionStore.getState().sessionId)
        if (cancelled) return
        await pc.setRemoteDescription({ type: 'answer', sdp: answer })
      } catch (e) {
        // 501 means the server is on Gemini; anything else is a genuine failure.
        // Both end the same way, because both mean this path cannot serve.
        giveUp(e?.code === UNSUPPORTED ? 'provider does not support realtime' : 'connect failed', e)
        return
      }

      // ── Turn detection ──────────────────────────────────────────────────────
      // Unchanged from useVoice in everything but what it triggers.
      const ctx = new AudioContext()
      own.ctx = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(analyser)

      const data = new Uint8Array(analyser.fftSize)
      let speaking = false
      let noiseFloor = 0

      const tick = () => {
        if (cancelled) return

        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const d = data[i] - 128
          sum += d * d
        }
        const rms = Math.sqrt(sum / data.length)
        if (levelRef) levelRef.current = rms

        if (!speaking) {
          const alpha = rms < noiseFloor ? 0.25 : 0.02
          noiseFloor += (rms - noiseFloor) * alpha
        }
        const threshold = Math.max(FLOOR_MIN, noiseFloor * NOISE_FACTOR + NOISE_MARGIN)

        if (rms > threshold) {
          speaking = true
          if (own.silence) { clearTimeout(own.silence); own.silence = null }
        } else if (speaking && !own.silence) {
          own.silence = setTimeout(() => {
            speaking = false
            own.silence = null
            // The deltas for the tail of a sentence land slightly after the
            // audio does, so committing on the exact silence edge would clip the
            // last word or two. SILENCE_MS is already longer than the observed
            // delta lag, so by here the text has caught up.
            commit()
          }, SILENCE_MS)
        }

        own.raf = requestAnimationFrame(tick)
      }
      own.raf = requestAnimationFrame(tick)
    }

    run()

    return () => {
      cancelled = true
      release()
    }
  }, [enabled, source, onQuestion, onPartial, onUnsupported, levelRef])
}
