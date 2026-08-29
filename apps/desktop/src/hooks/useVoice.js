import { useEffect } from 'react'
import { transcribe } from '../services/aiRouter'

/**
 * Microphone capture with voice-activity detection. Pure audio → text: it owns
 * no AI calls and no store writes, so it can be mounted once high in the tree
 * and never torn down mid-session.
 *
 * @param {boolean}  enabled     start/stop capture
 * @param {Function} onQuestion  called with each transcribed utterance
 * @param {object}   levelRef    optional ref that receives the live RMS level.
 *                               A ref, not state — this updates ~60×/s and
 *                               would otherwise re-render the whole tree.
 */

const RMS_SPEAKING   = 12     // volume above which we consider it speech
const SILENCE_MS     = 1500   // silence before an utterance is closed
const MIN_BLOB_BYTES = 2000   // below this there is no usable audio
const MIN_TEXT_CHARS = 4
const FILLER = /^(thank you|thanks|okay|ok|yes|no|hmm+|uh+|um+|\.+)$/i

export function useVoice({ enabled, onQuestion, levelRef }) {
  useEffect(() => {
    if (!enabled) return

    // Guards every async continuation below. Without it, a session stopped
    // while getUserMedia is still resolving leaks a live microphone.
    let cancelled = false
    const own = { stream: null, rec: null, ctx: null, raf: 0, silence: null }

    const run = async () => {
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
        })
      } catch (e) {
        console.error('[voice] microphone unavailable:', e.message)
        return
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      own.stream = stream

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      own.rec = recorder

      let chunks = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType })
        chunks = []
        // onstop also fires during teardown. Transcribing that tail would cost
        // an extra API call and surface a phantom question after "Stop".
        if (cancelled) return
        if (blob.size > MIN_BLOB_BYTES) handleUtterance(blob)
      }

      const handleUtterance = async (blob) => {
        try {
          // The recorder produces webm; Whisper infers the container from the
          // filename, so the extension has to match.
          const text = await transcribe(blob, 'audio.webm')
          if (cancelled) return
          if (!text || text.length < MIN_TEXT_CHARS) return
          if (FILLER.test(text)) return

          window.electronAPI?.sendTranscript?.({ text })
          onQuestion(text)
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

      const tick = () => {
        analyser.getByteTimeDomainData(data)

        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const d = data[i] - 128
          sum += d * d
        }
        const rms = Math.sqrt(sum / data.length)
        if (levelRef) levelRef.current = rms

        if (rms > RMS_SPEAKING) {
          if (!speaking) {
            speaking = true
            if (recorder.state === 'inactive') { chunks = []; recorder.start() }
          }
          if (own.silence) { clearTimeout(own.silence); own.silence = null }
        } else if (speaking && !own.silence) {
          own.silence = setTimeout(() => {
            speaking = false
            own.silence = null
            if (recorder.state === 'recording') recorder.stop()
          }, SILENCE_MS)
        }

        own.raf = requestAnimationFrame(tick)
      }
      own.raf = requestAnimationFrame(tick)
    }

    run()

    return () => {
      cancelled = true
      if (own.raf) cancelAnimationFrame(own.raf)
      if (own.silence) clearTimeout(own.silence)
      if (own.rec?.state === 'recording') own.rec.stop()
      // Chromium caps a page at 6 AudioContexts. Without this close() the mic
      // stops working after a few start/stop cycles.
      own.ctx?.close().catch(() => {})
      own.stream?.getTracks().forEach((t) => t.stop())
      if (levelRef) levelRef.current = 0
    }
  }, [enabled, onQuestion, levelRef])
}
