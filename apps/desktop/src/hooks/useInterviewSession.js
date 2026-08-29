import { useCallback, useEffect, useRef } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { useSettingsStore } from '../store/settingsStore'
import { askAIStream } from '../services/aiRouter'
import { useVoice } from './useVoice'

/**
 * Owns the live interview session: microphone capture, transcription and answer
 * generation.
 *
 * Mounted once in MainApp, ABOVE the branch that swaps the dashboard for the
 * floating panel. That placement is the whole point — if this lived in a page
 * component, starting a session would unmount it and kill the MediaRecorder the
 * instant it started.
 *
 * It subscribes to `isRunning` and nothing else. Subscribing to currentAnswer
 * here would re-render the entire app on every streamed token.
 */
export function useInterviewSession() {
  const isRunning = useSessionStore((s) => s.isRunning)

  const genRef   = useRef(0)   // increments to supersede an in-flight answer
  const levelRef = useRef(0)   // live mic RMS, read by the level meter's own rAF
  const bufRef   = useRef('')  // chunks awaiting the next frame
  const rafRef   = useRef(0)

  // Stream deltas arrive one microtask apart, so an uncoalesced stream is one
  // React render per delta. Flushing on a frame caps that at ~60/s.
  const flush = useCallback(() => {
    rafRef.current = 0
    const text = bufRef.current
    if (!text) return
    bufRef.current = ''
    useSessionStore.getState().appendAnswer(text)
  }, [])

  const generate = useCallback(async (question, source = 'voice') => {
    const q = question?.trim()
    if (!q) return

    const gen = ++genRef.current
    useSessionStore.getState().setQuestion(q, source)
    bufRef.current = ''

    try {
      await askAIStream(
        [{ role: 'user', content: q }],
        (chunk) => {
          if (gen !== genRef.current) return     // a newer question took over
          bufRef.current += chunk
          if (!rafRef.current) rafRef.current = requestAnimationFrame(flush)
        },
        null,
        // Read at call time so changing the model mid-session takes effect.
        useSettingsStore.getState().model,
      )
    } catch (e) {
      if (gen === genRef.current) useSessionStore.getState().setError(e.message)
    } finally {
      if (gen === genRef.current) {
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
        flush()
        useSessionStore.getState().setAnswerDone()
      }
    }
  }, [flush])

  // Stable identity: useVoice tears down and re-acquires the mic if this changes.
  const onQuestion = useCallback((text) => generate(text, 'voice'), [generate])

  useVoice({ enabled: isRunning, onQuestion, levelRef })

  const askManual = useCallback((text) => generate(text, 'manual'), [generate])

  const regenerate = useCallback(() => {
    const { currentQuestion, source } = useSessionStore.getState()
    if (currentQuestion) generate(currentQuestion, source)
  }, [generate])

  const start = useCallback(() => {
    useSessionStore.getState().startSession()
    window.electronAPI?.enterSessionMode?.()
  }, [])

  const stop = useCallback(() => {
    genRef.current++                    // orphan anything still streaming
    useSessionStore.getState().stopSession()
    window.electronAPI?.exitSessionMode?.()
  }, [])

  // Unmounting (sign-out, licence revoked) must not leave a stream writing.
  useEffect(() => () => { genRef.current++ }, [])

  return { levelRef, start, stop, askManual, regenerate }
}
