import { useState, useCallback, useRef } from 'react'
import { askClaude, askClaudeStream } from '../services/claude'

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
      const result = await askClaude(transcript)
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
      await askClaudeStream(
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
      await askClaudeStream(
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
