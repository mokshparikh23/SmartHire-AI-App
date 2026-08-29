import { create } from 'zustand'

/**
 * Session state, split into two paths on purpose:
 *
 *   currentQuestion / currentAnswer / isThinking  — the STREAMING fast path.
 *     Mutated many times per second while an answer streams. Only the answer
 *     body subscribes to these, so a token re-renders one leaf.
 *
 *   turns[]  — the COMMITTED log. Written once per completed answer. The panel's
 *     pager and the post-session Dashboard list read this.
 *
 * Streaming text is deliberately NOT duplicated into `turns` per token.
 */
export const useSessionStore = create((set, get) => ({
  // Session
  isRunning: false,
  startTime: null,
  elapsed: 0,          // seconds
  timerInterval: null,

  // Streaming fast path
  currentQuestion: '',
  currentAnswer: '',
  isThinking: false,
  source: 'voice',     // 'voice' | 'manual' — how the current question arrived
  error: null,

  // Committed log
  turns: [],           // [{ id, q, a, ts, source, error }]
  activeTurnId: null,  // null = showing the live stream, not a past turn

  // ── Actions ───────────────────────────────────────────────────────────────
  startSession: () => {
    const interval = setInterval(() => {
      set((s) => ({ elapsed: Math.floor((Date.now() - s.startTime) / 1000) }))
    }, 1000)

    set({
      isRunning: true,
      startTime: Date.now(),
      elapsed: 0,
      timerInterval: interval,
      currentQuestion: '',
      currentAnswer: '',
      isThinking: false,
      source: 'voice',
      error: null,
      turns: [],
      activeTurnId: null,
    })
  },

  stopSession: () => {
    const { timerInterval } = get()
    if (timerInterval) clearInterval(timerInterval)
    set({ isRunning: false, timerInterval: null, isThinking: false })
  },

  setQuestion: (q, source = 'voice') =>
    set({
      currentQuestion: q,
      currentAnswer: '',
      isThinking: true,
      source,
      error: null,
      activeTurnId: null,   // a new question always returns us to the live view
    }),

  appendAnswer: (chunk) => set((s) => ({ currentAnswer: s.currentAnswer + chunk })),

  setAnswerDone: () => {
    const { currentQuestion, currentAnswer, source, turns, error } = get()
    if (!currentQuestion) return set({ isThinking: false })

    const turn = {
      id: `${turns.length}-${currentQuestion.slice(0, 24)}`,
      q: currentQuestion,
      a: currentAnswer,
      ts: Date.now(),      // wall clock — Dashboard renders this as a time of day
      source,
      error,
    }
    set({ isThinking: false, turns: [...turns, turn], activeTurnId: turn.id })
  },

  setError: (msg) => set({ error: msg, isThinking: false }),

  /** Repoint the fast path at a stored turn. Cheap — no refetch. */
  selectTurn: (id) => {
    const turn = get().turns.find((t) => t.id === id)
    if (!turn) return
    set({
      currentQuestion: turn.q,
      currentAnswer: turn.a,
      source: turn.source,
      error: turn.error ?? null,
      isThinking: false,
      activeTurnId: id,
    })
  },

  clearCurrent: () =>
    set({ currentQuestion: '', currentAnswer: '', isThinking: false, error: null, activeTurnId: null }),

  // Format elapsed as MM:SS
  getFormattedTime: () => {
    const { elapsed } = get()
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0')
    const s = (elapsed % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  },
}))
