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

  /* PIPELINE 2026-08-31 ─ "the user wants capture" is not "capture is running" ─
     micEnabled is set by a toolbar click and by nothing else. It knew nothing
     about whether acquire() succeeded, so the panel painted a green "listening"
     chip over dead capture in three separate paths: acquire throwing in either
     hook, and useVoice exhausting MAX_RESTARTS.

     captureError is a SEPARATE field from `error` for the same reason chatError
     is (see its note below): `error` is cleared by setQuestion and clearAnswer,
     so "your microphone is dead" was wiped without trace by the next thing
     anyone said. A capture failure has to outlive the next question. */
  captureState: 'idle',      // 'idle' | 'live' | 'failed'
  captureError: null,
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
      // PIPELINE 2026-08-31: a capture failure from the previous session must
      // not be showing over a fresh one.
      captureState: 'idle',
      captureError: null,
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

  /* SEGMENTATION 2026-08-30 ─ the turn that used to vanish ────────────────────
     A question arriving mid-stream superseded the one before it, and the partial
     answer was lost outright: generate()'s finally block gates everything on
     `gen === genRef.current`, so setAnswerDone() never ran for the superseded
     generation, and setQuestion() above had already blanked currentAnswer.
     Whatever had streamed was gone from the screen and absent from turns[].

     The fix cannot live in that finally — by the time the old generation reaches
     it the wipe has happened. It has to run at the supersede site, BEFORE
     setQuestion. Hence a separate action rather than a flag on setQuestion:
     ordering is the whole point of it.

     activeTurnId is the existing "is the live pair already committed?" signal —
     setAnswerDone sets it, setQuestion nulls it, selectTurn points it at
     history. A non-null id here means there is nothing uncommitted to rescue. */
  commitInterrupted: () => {
    const { currentQuestion, currentAnswer, source, turns, activeTurnId, error } = get()
    if (!currentQuestion || activeTurnId !== null) return

    set({
      turns: [...turns, {
        id: `${turns.length}-${currentQuestion.slice(0, 24)}`,
        q: currentQuestion,
        a: currentAnswer,
        ts: Date.now(),
        source,
        error,
        feedback: null,
        interrupted: true,   // the answer was cut short, not finished
      }],
    })
  },

  setAnswerDone: () => {
    const { currentQuestion, currentAnswer, source, turns, error } = get()
    if (!currentQuestion) return set({ isThinking: false })

    /* PIPELINE 2026-08-31 ─ a completion that streamed nothing showed nothing ──
       If the provider sends zero content deltas — the exact Gemini-3
       thinking-budget failure documented in apps/web/lib/ai.js — pumpStream
       returns normally, this commits a turn with a: '', and AnswerPanel falls
       through EVERY branch to null: the question header, a completely blank
       body, no error, no retry, no explanation. The user sees the app answer
       with silence and has nothing to press.

       Fixed here rather than in the panel so every caller is covered at once,
       and so the turn still lands in turns[] with a reason attached —
       turns[].error already exists and selectTurn already restores it. */
    const failed = error || (!currentAnswer
      ? 'The model returned nothing. Retry the question.'
      : null)

    const turn = {
      id: `${turns.length}-${currentQuestion.slice(0, 24)}`,
      q: currentQuestion,
      a: currentAnswer,
      ts: Date.now(),      // wall clock — Dashboard renders this as a time of day
      source,
      // error,
      error: failed,
      feedback: null,      // REDESIGN 2026-08-29: 'up' | 'down' from the card footer
    }
    // set({ isThinking: false, turns: [...turns, turn], activeTurnId: turn.id })
    set({ isThinking: false, error: failed, turns: [...turns, turn], activeTurnId: turn.id })
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
  /* PIPELINE 2026-08-31: toggling the source or re-enabling capture is the user
     explicitly asking for another attempt, so both clear the failed state. If
     the retry fails too, the hooks write it straight back. */
  // setMicEnabled:      (v) => set({ micEnabled: v }),
  // setCaptureSource:   (v) => set({ captureSource: v }),
  setMicEnabled:      (v) => set({ micEnabled: v, captureState: 'idle', captureError: null }),
  setCaptureSource:   (v) => set({ captureSource: v, captureState: 'idle', captureError: null }),

  /** PIPELINE 2026-08-31: 'live' once acquire() returns, 'failed' with a reason
   *  at every site that gives up. Deliberately NOT cleared by setQuestion or
   *  clearAnswer — that is the whole point of it being its own field. */
  setCaptureState: (s, err = null) => set({ captureState: s, captureError: err }),
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
  /* PIPELINE 2026-08-31 ─ this silently deleted the turn ──────────────────────
     Blanking currentQuestion mid-stream meant that when the stream finished,
     setAnswerDone hit its `if (!currentQuestion) return set({isThinking:false})`
     guard and never pushed the turn. The answer stayed on screen with no
     question header, absent from turns[], absent from the pager, and gone the
     moment anything else was asked.

     commitInterrupted is the action written for exactly this ordering trap —
     rescue the live pair BEFORE the thing that makes it unrecoverable. It
     returns early unless a live uncommitted pair exists, so this is a no-op in
     the ordinary case and cannot double-push. */
  // clearTranscript: () => set({ currentQuestion: '', source: 'voice' }),
  clearTranscript: () => {
    get().commitInterrupted()
    set({ currentQuestion: '', source: 'voice' })
  },

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

  /* PIPELINE 2026-08-31: same empty-completion case as setAnswerDone, one
     surface over. A chat turn that streamed nothing left a permanently blank
     assistant bubble with no reason. failChatTurn already knows how to drop an
     empty bubble and set chatError, so delegate rather than repeat it. */
  // setChatDone:  () => set({ chatStreaming: false }),
  setChatDone: () => {
    const { chatMessages } = get()
    const last = chatMessages[chatMessages.length - 1]
    if (last && last.role === 'assistant' && last.content === '') {
      return get().failChatTurn('The model returned nothing. Send it again.')
    }
    set({ chatStreaming: false })
  },
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
