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

  // SESSION GATE 2026-08-29: the metered session opened by /api/session/start.
  // Every AI call needs this id — without it the routes answer 402 no_session.
  sessionId: null,
  unlimited: false,
  minutesRemaining: null,
  heartbeatSeconds: 20,
  blockedReason: null,   // 'out_of_credits' | 'request_limit' | … , or null

  // Streaming fast path
  currentQuestion: '',
  currentAnswer: '',
  questionAt: null,      // REDESIGN 2026-08-29: wall clock for the card's footer
  isThinking: false,
  source: 'voice',     // 'voice' | 'manual' — how the current question arrived
  error: null,

  // REDESIGN 2026-08-29: capture toggles in the new toolbar. `screenPermission`
  // mirrors the macOS TCC grant, which the app can read and open Settings for
  // but cannot request — see capture:permission in electron/main.cjs.
  micEnabled: true,
  /* SYSTEM-AUDIO 2026-08-30: which audio the session listens to.
     'system' = loopback, the other side of a call. 'mic' = the room.

     Defaults to 'system' because that is the whole point of the capture: on
     headphones the microphone hears the remote speaker not at all, which is
     what made the old mic-only capture look broken rather than limited.

     `micEnabled` keeps its name and now means "the active source is on".
     Renaming it would have touched SessionPanel's state calculation and the
     Toolbar toggle for no behavioural gain. */
  captureSource: 'system',   // 'system' | 'mic'
  // On by default so Screenshot is usable without a preparatory click. The
  // mount check in SessionPanel forces this back off when the grant is missing,
  // so "on" never means "on but silently broken".
  screenEnabled: true,
  screenPermission: 'granted',   // 'granted' | 'denied' | 'not-determined'

  // REDESIGN 2026-08-29: Chat mode. A separate thread from the Q→A fast path, so
  // toggling it never disturbs a streaming answer.
  chatMode: false,
  chatMessages: [],    // [{ id, role: 'user'|'assistant', content }]
  chatStreaming: false,
  // BUGFIX 2026-08-30: chat needs its own error, separate from `error` — that
  // one is rendered by AnswerPanel only, so chat failures were invisible.
  chatError: null,

  // Committed log
  turns: [],           // [{ id, q, a, ts, source, error, feedback }]
  activeTurnId: null,  // null = showing the live stream, not a past turn

  // ── Actions ───────────────────────────────────────────────────────────────
  // SESSION GATE 2026-08-29: takes the /api/session/start payload, so the id the
  // AI routes gate on is in the store before any question can be asked.
  // startSession: () => {
  startSession: (meta = {}) => {
    const interval = setInterval(() => {
      set((s) => ({ elapsed: Math.floor((Date.now() - s.startTime) / 1000) }))
    }, 1000)

    set({
      isRunning: true,
      startTime: Date.now(),
      elapsed: 0,
      timerInterval: interval,
      sessionId:        meta.sessionId ?? null,
      unlimited:        !!meta.unlimited,
      minutesRemaining: meta.minutesRemaining ?? null,
      // Sent by the server so the cadence can be retuned without a new build.
      heartbeatSeconds: meta.heartbeatSeconds || 20,
      blockedReason: null,
      currentQuestion: '',
      currentAnswer: '',
      questionAt: null,
      isThinking: false,
      source: 'voice',
      error: null,
      chatMode: false,
      chatMessages: [],
      chatStreaming: false,
      chatError: null,
      turns: [],
      activeTurnId: null,
    })
  },

  stopSession: () => {
    const { timerInterval } = get()
    if (timerInterval) clearInterval(timerInterval)
    // set({ isRunning: false, timerInterval: null, isThinking: false })
    set({
      isRunning: false, timerInterval: null, isThinking: false,
      sessionId: null, chatStreaming: false,
    })
  },

  /**
   * Applied on every heartbeat, so the ⋮ menu's balance stays current.
   * `metered: false` is what an unlimited subscription looks like on the wire —
   * minutesRemaining is still the credit balance underneath, so the UI has to
   * branch on this flag rather than on the number being large.
   */
  applyHeartbeat: (beat) =>
    set({
      minutesRemaining: beat?.minutesRemaining ?? null,
      unlimited: beat?.metered === false,
      blockedReason: beat?.stop ? (beat.reason || 'stopped') : null,
    }),

  setQuestion: (q, source = 'voice') =>
    set({
      currentQuestion: q,
      currentAnswer: '',
      // REDESIGN 2026-08-29: the answer card's footer shows "Answer · HH:MM".
      // turns[].ts covers history; this covers the turn still streaming.
      questionAt: Date.now(),
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
      feedback: null,      // REDESIGN 2026-08-29: 'up' | 'down' from the card footer
    }
    set({ isThinking: false, turns: [...turns, turn], activeTurnId: turn.id })
  },

  /**
   * REDESIGN 2026-08-29: thumbs up/down on the answer card.
   *
   * SESSION-LOCAL ONLY. There is no table and no endpoint for this, so it dies
   * with the session — deliberately, rather than inventing a schema here.
   * Clicking the active choice again clears it.
   */
  setFeedback: (id, value) =>
    set((s) => ({
      turns: s.turns.map((t) =>
        t.id === id ? { ...t, feedback: t.feedback === value ? null : value } : t
      ),
    })),

  setError: (msg) => set({ error: msg, isThinking: false }),

  /** Repoint the fast path at a stored turn. Cheap — no refetch. */
  selectTurn: (id) => {
    const turn = get().turns.find((t) => t.id === id)
    if (!turn) return
    set({
      currentQuestion: turn.q,
      currentAnswer: turn.a,
      questionAt: turn.ts,   // REDESIGN 2026-08-29: card footer follows the turn
      source: turn.source,
      error: turn.error ?? null,
      isThinking: false,
      activeTurnId: id,
    })
  },

  /* REDESIGN 2026-08-29 ─ capture toggles in the new toolbar ───────────────── */
  setMicEnabled:      (v) => set({ micEnabled: v }),
  setCaptureSource:   (v) => set({ captureSource: v }),
  setScreenEnabled:   (v) => set({ screenEnabled: v }),
  setScreenPermission: (p) => set({
    screenPermission: p,
    // A revoked grant must not leave the toggle reading as on. 'not-determined'
    // is NOT a refusal — macOS has simply not asked yet, and the first
    // desktopCapturer call is what raises the prompt, so leave it enabled.
    screenEnabled: (p === 'denied' || p === 'restricted') ? false : get().screenEnabled,
  }),

  clearCurrent: () =>
    set({ currentQuestion: '', currentAnswer: '', isThinking: false, error: null, activeTurnId: null }),

  /* REDESIGN 2026-08-29 ─ the two Clear buttons in the new chrome ──────────── */

  /** Transcript bar's Clear (⌘⇧⌫) — drops the heard question, keeps the answer. */
  clearTranscript: () => set({ currentQuestion: '', source: 'voice' }),

  /** Answer card's Clear (⌘⌫) — empties the card without touching the log. */
  clearAnswer: () =>
    set({ currentAnswer: '', questionAt: null, isThinking: false, error: null }),

  /* REDESIGN 2026-08-29 ─ Chat mode ────────────────────────────────────────── */

  toggleChat: () => set((s) => ({ chatMode: !s.chatMode })),

  /** Appends the user's message plus the empty assistant turn it streams into. */
  startChatTurn: (text) =>
    set((s) => ({
      chatStreaming: true,
      chatError: null,          // BUGFIX 2026-08-30: a retry clears the last failure
      chatMessages: [
        ...s.chatMessages,
        { id: `u${s.chatMessages.length}`, role: 'user', content: text },
        { id: `a${s.chatMessages.length}`, role: 'assistant', content: '' },
      ],
    })),

  /**
   * BUGFIX 2026-08-30: a failed chat request used to leave a blank assistant
   * bubble and nothing else — reportFailure() wrote to `error`, which only
   * AnswerPanel renders, so in chat mode the message simply never got a reply
   * and no reason was shown anywhere.
   *
   * Chat gets its own error field rather than sharing `error`: the two surfaces
   * are visible at different times, and a stale answer error must not appear
   * over the chat thread (or the reverse) when the Chat pill is toggled.
   */
  failChatTurn: (message) =>
    set((s) => {
      const next = s.chatMessages.slice()
      // Drop the empty assistant turn startChatTurn pushed. If it already has
      // partial text, keep it — the user should see what did arrive.
      const last = next[next.length - 1]
      if (last && last.role === 'assistant' && last.content === '') next.pop()
      return {
        chatMessages: next,
        chatStreaming: false,
        chatError: message || 'The request failed.',
      }
    }),

  /** Streams into the last message. Mirrors appendAnswer's one-leaf-render cost. */
  appendChat: (chunk) =>
    set((s) => {
      const next = s.chatMessages.slice()
      const last = next[next.length - 1]
      if (!last || last.role !== 'assistant') return {}
      next[next.length - 1] = { ...last, content: last.content + chunk }
      return { chatMessages: next }
    }),

  setChatDone:  () => set({ chatStreaming: false }),
  // clearChat: () => set({ chatMessages: [], chatStreaming: false }),
  clearChat:    () => set({ chatMessages: [], chatStreaming: false, chatError: null }),

  // Format elapsed as MM:SS
  getFormattedTime: () => {
    const { elapsed } = get()
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0')
    const s = (elapsed % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  },
}))
