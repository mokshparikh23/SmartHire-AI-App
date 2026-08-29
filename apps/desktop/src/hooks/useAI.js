import { useState, useCallback, useRef } from 'react'
import { askAI, askAIStream } from '../services/aiRouter'

export function useAI() {
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(false)

  const ask = useCallback(async (question) => {
    if (!question?.trim()) return
    setLoading(true)
    setError(null)
    setAnswer('')
    abortRef.current = false
    try {
      const transcript = [{ role: 'user', content: question }]
      const result = await askAI(transcript)
      if (!abortRef.current) setAnswer(result)
    } catch (err) {
      if (!abortRef.current) setError(err.message)
    } finally {
      if (!abortRef.current) setLoading(false)
    }
  }, [])

  const askStream = useCallback(async (question) => {
    if (!question?.trim()) return
    setLoading(true)
    setError(null)
    setAnswer('')
    abortRef.current = false
    try {
      const transcript = [{ role: 'user', content: question }]
      await askAIStream(
        transcript,
        (chunk) => { if (!abortRef.current) setAnswer((prev) => prev + chunk) },
        () => { if (!abortRef.current) setLoading(false) }
      )
    } catch (err) {
      if (!abortRef.current) { setError(err.message); setLoading(false) }
    }
  }, [])

  const askWithHistory = useCallback(async (transcript) => {
    if (!transcript?.length) return
    setLoading(true)
    setError(null)
    setAnswer('')
    abortRef.current = false
    try {
      await askAIStream(
        transcript,
        (chunk) => { if (!abortRef.current) setAnswer((prev) => prev + chunk) },
        () => { if (!abortRef.current) setLoading(false) }
      )
    } catch (err) {
      if (!abortRef.current) { setError(err.message); setLoading(false) }
    }
  }, [])

  const stop = useCallback(() => { abortRef.current = true; setLoading(false) }, [])
  const clear = useCallback(() => { abortRef.current = true; setAnswer(''); setError(null); setLoading(false) }, [])

  return { answer, loading, error, ask, askStream, askWithHistory, stop, clear }
}
