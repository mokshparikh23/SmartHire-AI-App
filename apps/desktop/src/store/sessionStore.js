import { create } from 'zustand'

export const useSessionStore = create((set, get) => ({
  // Session state
  isRunning: false,
  startTime: null,
  elapsed: 0,          // seconds
  timerInterval: null,

  // Current question + answer
  currentQuestion: '',
  currentAnswer: '',
  isThinking: false,

  // History of Q&A pairs
  history: [],

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
      history: [],
    })
  },

  stopSession: () => {
    const { timerInterval } = get()
    if (timerInterval) clearInterval(timerInterval)
    set({ isRunning: false, timerInterval: null })
  },

  setQuestion: (q) => set({ currentQuestion: q, currentAnswer: '', isThinking: true }),

  appendAnswer: (chunk) => set((s) => ({ currentAnswer: s.currentAnswer + chunk })),

  setAnswerDone: () => {
    const { currentQuestion, currentAnswer, history } = get()
    if (currentQuestion && currentAnswer) {
      set({
        isThinking: false,
        history: [...history, { q: currentQuestion, a: currentAnswer, ts: Date.now() }],
      })
    } else {
      set({ isThinking: false })
    }
  },

  clearCurrent: () => set({ currentQuestion: '', currentAnswer: '', isThinking: false }),

  // Format elapsed as MM:SS
  getFormattedTime: () => {
    const { elapsed } = get()
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0')
    const s = (elapsed % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  },
}))