import { useEffect, useRef, useCallback } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { useSettingsStore } from '../store/settingsStore'
import { askAIStream, transcribe } from '../services/aiRouter'

export function useVoice() {
  const mediaRecorderRef  = useRef(null)
  const chunksRef         = useRef([])
  const streamRef         = useRef(null)
  const analyserRef       = useRef(null)
  const silenceTimerRef   = useRef(null)
  const isSpeakingRef     = useRef(false)
  const animFrameRef      = useRef(null)

  const { isRunning, setQuestion, appendAnswer, setAnswerDone } = useSessionStore()
  const { model } = useSettingsStore()

  // ── Ask the model ────────────────────────────────────────────────────────
  const askModel = useCallback(async (question) => {
    console.log('🤖 Question:', question)
    setQuestion(question)

    try {
      await askAIStream(
        [{ role: 'user', content: question }],
        (chunk) => appendAnswer(chunk),
        null,
        model,
      )
    } catch (e) {
      console.error('❌ LLM error:', e.message)
    } finally {
      setAnswerDone()
    }
  }, [model, setQuestion, appendAnswer, setAnswerDone])

  // ── Transcribe blob ───────────────────────────────────────────────────────
  const transcribeAndAsk = useCallback(async (audioBlob) => {
    if (audioBlob.size < 2000) return

    console.log('🎙 Transcribing blob size:', audioBlob.size)

    try {
      // The recorder produces webm; the extension has to match or Whisper
      // rejects the upload as an unsupported format.
      const text = await transcribe(audioBlob, 'audio.webm')
      console.log('📝 Transcribed:', text)

      // Filter out filler non-questions
      if (!text || text.length < 4) return
      if (/^(thank you|thanks|okay|ok|yes|no|hmm+|uh+|um+|\.+)$/i.test(text)) return

      window.electronAPI?.sendTranscript?.({ text })
      await askModel(text)
    } catch (e) {
      console.error('❌ Transcribe exception:', e.message)
    }
  }, [askModel])

  // ── Silence detection via Web Audio API ──────────────────────────────────
  const startSilenceDetection = useCallback((stream) => {
    const audioCtx  = new AudioContext()
    const source    = audioCtx.createMediaStreamSource(stream)
    const analyser  = audioCtx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    analyserRef.current = analyser

    const dataArray  = new Uint8Array(analyser.fftSize)
    const THRESHOLD  = 12   // volume level to consider as speech
    const SILENCE_MS = 1500 // ms of silence before cutting

    const check = () => {
      analyser.getByteTimeDomainData(dataArray)

      // RMS volume
      const rms = Math.sqrt(
        dataArray.reduce((sum, v) => sum + (v - 128) ** 2, 0) / dataArray.length
      )

      const recorder = mediaRecorderRef.current

      if (rms > THRESHOLD) {
        // Speaking detected
        if (!isSpeakingRef.current) {
          isSpeakingRef.current = true
          console.log('🗣 Speech started')
          if (recorder?.state === 'inactive') {
            chunksRef.current = []
            recorder.start()
          }
        }
        // Reset silence timer
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
      } else {
        // Silence detected
        if (isSpeakingRef.current && !silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            isSpeakingRef.current = false
            silenceTimerRef.current = null
            console.log('🤫 Silence detected — stopping chunk')
            if (recorder?.state === 'recording') {
              recorder.stop()
            }
          }, SILENCE_MS)
        }
      }

      animFrameRef.current = requestAnimationFrame(check)
    }

    animFrameRef.current = requestAnimationFrame(check)
  }, [])

  // ── Start recording ───────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    console.log('🎤 Starting recording with silence detection...')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        }
      })
      streamRef.current  = stream
      chunksRef.current  = []
      isSpeakingRef.current = false

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : ''

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        chunksRef.current = []
        console.log('🔴 Blob ready:', blob.size)
        if (blob.size > 2000) transcribeAndAsk(blob)

        // If still running, prepare for next utterance
      }

      // Start silence detection (controls recorder start/stop)
      startSilenceDetection(stream)
      console.log('✅ Silence detection active')

    } catch (e) {
      console.error('❌ Mic error:', e.message)
    }
  }, [transcribeAndAsk, startSilenceDetection])

  // ── Stop recording ────────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    console.log('⏹ Stopping...')
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    isSpeakingRef.current = false
  }, [])

  // ── Auto start/stop with session ──────────────────────────────────────────
  useEffect(() => {
    if (isRunning) startRecording()
    else stopRecording()
    return () => stopRecording()
  }, [isRunning])

  return { startRecording, stopRecording }
}
