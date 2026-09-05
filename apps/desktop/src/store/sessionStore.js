import { create } from 'zustand'
// PIPELINE 2026-08-31: the same join used to stitch fragments inside one
// utterance, reused to stitch an utterance to its continuation. Pure and
// dependency-free, so importing it here costs nothing.
import { joinFragments } from '../utils/textFormatter'

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
  /* PIPELINE 2026-08-31 ─ why the answer no longer flickers ───────────────────
     setQuestion used to blank currentAnswer immediately, so the instant a new
     question was heard the card went from a readable answer to three dots and
     stayed there for the whole time-to-first-token. With the aggregator now able
     to supersede more often — an extended question, a retry — that flicker was
     going to get worse rather than better.

     answerPending means "the answer on screen belongs to the previous request;
     replace it the moment the first token of the new one arrives". appendAnswer
     honours it, so the swap happens in one frame with no empty state in
     between. */
  answerPending: false,
  source: 'voice',     // 'voice' | 'manual' — how the current question arrived
  error: null,
  /* STOP-IS-NOT-AN-ERROR 2026-09-01 ─ "the user did this" vs "this broke" ──────
     Pressing Stop before the first token produced a red
     "The model returned nothing. Retry the question." — the app blaming the
     provider for something the user had just chosen. It rides alongside `error`
     rather than being a value of it because the two need different styling and
     different words, and because an error must never be silently downgraded to
     a stop: setAnswerDone only sets this when the caller says so.

     Reset everywhere `error` is. If you add a reset for one, add it for both. */
  stopped: false,

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

  /* SELF-VOICE 2026-08-31 ─ what the CANDIDATE said, waiting for its turn ──────
     The app only ever captured the interviewer, so the `assistant` entries in
     the history sent to the model were the AI's own past SUGGESTIONS — not a
     word of what the candidate actually said out loud. When the interviewer then
     asked "why?" or "can you elaborate?", the thing being asked about had never
     been shown to the model at all. That is the reported "short questions get no
     understanding", and no amount of prompt wording fixes it.

     A bounded ring, not a log: these are attached to the NEXT question asked and
     then drained, so anything still sitting here is at most one turn old. The
     cap exists only so that a candidate who talks for ten minutes without being
     interrupted cannot grow this without limit. */
  selfSpeech: [],      // [{ id, text, at }] — drained by the next setQuestion
  currentSaid: [],     // what was drained onto the turn currently showing

  /* PREMIUM-UX 2026-08-31 ─ errors that survive the next question ─────────────
     Every failure in this app was rendered as a red box INSIDE the answer body:
     it occupied the space an answer should be, and it was silently wiped by the
     next setQuestion or clearAnswer. "Your microphone is dead" therefore
     disappeared without trace the moment anyone said anything — which, when the
     microphone is dead, is the one thing that still happens.

     A separate slice, rendered in its own bar above the toolbar. setQuestion and
     clearAnswer DO NOT TOUCH IT. That is the entire point.

     De-duped on text, because a retry loop would otherwise stack forty
     identical toasts over a panel that is 720px wide. */
  notices: [],         // [{ id, kind, text, action, sticky, at }]

  // Committed log
  // SELF-VOICE 2026-08-31: turns[] gains `said` — what the candidate had said
  // before that question, so recentHistory can replay it alongside the pair.
  // turns: [],        // [{ id, q, a, ts, source, error, feedback }]
  turns: [],           // [{ id, q, a, said, ts, source, error, feedback }]
  activeTurnId: null,  // null = showing the live stream, not a past turn

  /* PREMIUM-UX 2026-08-31 ─ what the card is SHOWING, vs what is LIVE ─────────
     These were one thing, and that is why reading was so fragile: selectTurn
     overwrote currentQuestion/currentAnswer with a stored turn, so paging back
     destroyed the live stream, and a new question always yanked the card to the
     new pair whether or not anybody was mid-sentence.

     The rule has to stay NARROW or it breaks the product. "Answers appear while
     the question is still being asked" is the whole value proposition, so a new
     question ALWAYS supersedes and ALWAYS starts streaming immediately. What
     changes is only which pair the card DISPLAYS.

     null = show the live pair. Non-null = show that committed turn instead, and
     let the live one stream underneath it. */
  pinnedTurnId: null,

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
      // PIPELINE 2026-08-31: answerPending cleared everywhere isThinking is.
      answerPending: false,
      source: 'voice',
      error: null,
      stopped: false,   // STOP-IS-NOT-AN-ERROR 2026-09-01
      chatMode: false,
      chatMessages: [],
      chatStreaming: false,
      chatError: null,
      // PIPELINE 2026-08-31: a capture failure from the previous session must
      // not be showing over a fresh one.
      captureState: 'idle',
      captureError: null,
      // SELF-VOICE 2026-08-31: last interview's words are not this one's context.
      selfSpeech: [],
      currentSaid: [],
      // PREMIUM-UX 2026-08-31: a fresh session starts with a clear surface.
      // Note stopSession deliberately does NOT clear these — a notice explaining
      // WHY a session ended has to outlive the session that raised it.
      notices: [],
      pinnedTurnId: null,
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
      answerPending: false,   // PIPELINE 2026-08-31
      selfSpeech: [], currentSaid: [],   // SELF-VOICE 2026-08-31
      pinnedTurnId: null,                // PREMIUM-UX 2026-08-31
      sessionId: null, chatStreaming: false,
    })
  },

  /**
   * Applied on every heartbeat, so the ⋮ menu's balance stays current.
   * `metered: false` is what an unlimited subscription looks like on the wire —
   * minutesRemaining is still the credit balance underneath, so the UI has to
   * branch on this flag rather than on the number being large.
   */
  /* PREMIUM-UX 2026-08-31 ─ the heartbeat must not un-block the panel ─────────
     `blockedReason: beat.stop ? … : null` meant every non-stopping tick CLEARED
     it — so a genuine out-of-credits state, with its "Top up credits" button,
     silently vanished within heartbeatSeconds (20 by default) and the user was
     left with an app that had simply stopped answering and offered no reason.

     The heartbeat is authoritative about STOPPING and about nothing else. What
     clears the block is the thing that proves it is over: a request that
     succeeds (see setAnswerDone) or a fresh session. */
  // applyHeartbeat: (beat) =>
  //   set({ …, blockedReason: beat?.stop ? (beat.reason || 'stopped') : null }),
  applyHeartbeat: (beat) =>
    set({
      minutesRemaining: beat?.minutesRemaining ?? null,
      unlimited: beat?.metered === false,
      ...(beat?.stop ? { blockedReason: beat.reason || 'stopped' } : {}),
    }),

  // PIPELINE 2026-08-31: opts.keepAnswer leaves the previous answer on screen
  // until the replacement's first token lands. See `answerPending` above.
  // setQuestion: (q, source = 'voice') =>
  /* SELF-VOICE 2026-08-31 ─ the candidate's own words ─────────────────────────
     MAX_SELF_LINES bounds the ring. Draining is the correct semantic rather than
     a rolling window: each line belongs to exactly ONE turn — the next question
     asked after it — so draining gives no duplication, no unbounded growth, and
     the right order for free. */
  appendSelfSpeech: (text) =>
    set((s) => {
      const clean = (text || '').trim()
      if (!clean) return {}
      const MAX_SELF_LINES = 40
      const next = [...s.selfSpeech, { id: s.selfSpeech.length, text: clean, at: Date.now() }]
      return { selfSpeech: next.slice(-MAX_SELF_LINES) }
    }),

  /* PREMIUM-UX 2026-08-31 ─ notices ──────────────────────────────────────────
     `kind` is 'error' | 'warn' | 'info'. `action` is an optional
     { label, href } — an href rather than a function so the notice stays plain
     data, which is what lets it survive stopSession and be rendered by the
     LAUNCHER after the panel is gone (see the session-kill path). */
  pushNotice: (notice) =>
    set((s) => {
      const text = (notice?.text || '').trim()
      if (!text) return {}
      // De-dupe on text: a retrying request must not stack identical toasts.
      if (s.notices.some((n) => n.text === text)) return {}
      const MAX_NOTICES = 3
      return {
        notices: [...s.notices, {
          id: `${Date.now()}-${s.notices.length}`,
          kind: notice.kind || 'error',
          text,
          action: notice.action || null,
          sticky: !!notice.sticky,
          at: Date.now(),
        }].slice(-MAX_NOTICES),
      }
    }),

  dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),

  /** Clears every notice raised by one subsystem, when its condition resolves. */
  clearNotices: (predicate) =>
    set((s) => ({ notices: typeof predicate === 'function' ? s.notices.filter((n) => !predicate(n)) : [] })),

  /** Hands over everything pending and empties the ring. */
  drainSelfSpeech: () => {
    const { selfSpeech } = get()
    if (!selfSpeech.length) return []
    set({ selfSpeech: [] })
    return selfSpeech.map((l) => l.text)
  },

  // SELF-VOICE 2026-08-31: opts.said carries the drained self lines onto the
  // turn, so setAnswerDone can commit them with the pair.
  setQuestion: (q, source = 'voice', opts = {}) =>
    set({
      currentQuestion: q,
      // currentAnswer: '',
      currentAnswer: opts.keepAnswer ? get().currentAnswer : '',
      answerPending: !!opts.keepAnswer,
      currentSaid: opts.said || [],   // SELF-VOICE 2026-08-31
      // REDESIGN 2026-08-29: the answer card's footer shows "Answer · HH:MM".
      // turns[].ts covers history; this covers the turn still streaming.
      questionAt: Date.now(),
      isThinking: true,
      source,
      error: null,
      stopped: false,   // STOP-IS-NOT-AN-ERROR 2026-09-01
      activeTurnId: null,   // a new question always returns us to the live view
      /* PREMIUM-UX 2026-08-31 ─ do not take an answer off a reader mid-sentence ─
         The new question still supersedes and still starts streaming — only the
         DISPLAY holds. opts.pinTo is the turn commitInterrupted just wrote, and
         the caller passes it only when the reader had deliberately scrolled away
         from the live edge. A reader at the bottom is following along and gets
         the new pair immediately, which is the common case and unchanged. */
      ...(opts.pinTo ? { pinnedTurnId: opts.pinTo } : {}),
    }),

  /* PIPELINE 2026-08-31 ─ the other half of not splitting a long question ─────
     When a cap forces an utterance out early, the rest of it arrives as a
     separate emit flagged `continues`. That is not a new question and must not
     go through setQuestion, which commits the previous pair and blanks the card.
     It appends to the question already showing and re-asks it as one.

     joinFragments is the same helper the aggregator uses to join fragments
     WITHIN an utterance — same hyphen, weak-punctuation and stray-full-stop
     rules — so a question stitched across a cap reads identically to one
     stitched across a pause. questionAt is deliberately untouched: the turn
     started when its first fragment landed. */
  extendQuestion: (more) => {
    const { currentQuestion, currentAnswer } = get()
    if (!more) return currentQuestion
    const next = currentQuestion ? joinFragments(currentQuestion, more) : more
    set({
      currentQuestion: next,
      currentAnswer,          // stays on screen until the new first token
      answerPending: true,
      // SELF-VOICE 2026-08-31: an extension keeps the self lines already on the
      // turn — it is the same question, so it has the same antecedent.
      currentSaid: get().currentSaid,
      isThinking: true,
      error: null,
      stopped: false,   // STOP-IS-NOT-AN-ERROR 2026-09-01
      activeTurnId: null,
    })
    return next
  },

  // appendAnswer: (chunk) => set((s) => ({ currentAnswer: s.currentAnswer + chunk })),
  /* PIPELINE 2026-08-31: one boolean read per flushed frame. This sits on the
     documented one-leaf-render-per-token path, but flush() already coalesces to
     ~60/s via rAF, so the cost is a branch on a value that changes once a turn. */
  appendAnswer: (chunk) => set((s) => (s.answerPending
    ? { currentAnswer: chunk, answerPending: false }
    : { currentAnswer: s.currentAnswer + chunk })),

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
    // SELF-VOICE 2026-08-31: currentSaid rides along, so a superseded turn keeps
    // the antecedent it was answered against.
    const { currentQuestion, currentAnswer, source, turns, activeTurnId, error, currentSaid } = get()
    if (!currentQuestion || activeTurnId !== null) return

    set({
      turns: [...turns, {
        id: `${turns.length}-${currentQuestion.slice(0, 24)}`,
        q: currentQuestion,
        a: currentAnswer,
        said: currentSaid,   // SELF-VOICE 2026-08-31
        ts: Date.now(),
        source,
        error,
        feedback: null,
        interrupted: true,   // the answer was cut short, not finished
      }],
    })
  },

  /**
   * @param {{stopped?: boolean}} [opts] - stopped:true means the USER ended this
   *   generation (Stop, ⌘⌫, the toolbar). Only stopGenerating passes it; the
   *   normal completion path in generate()'s finally must not, or a provider that
   *   silently returns nothing would be reported as something the user did.
   */
  // setAnswerDone: () => {
  setAnswerDone: (opts = {}) => {
    const { currentQuestion, currentAnswer, source, turns, error, currentSaid } = get()
    if (!currentQuestion) return set({ isThinking: false, answerPending: false })

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
    /* STOP-IS-NOT-AN-ERROR 2026-09-01 ─ the bug this guard fixes ───────────────
       stopGenerating() calls straight into here, so pressing Stop before the
       first token arrived took the `!currentAnswer` branch and painted a red
       "The model returned nothing. Retry the question." The provider had done
       nothing wrong; the user had just cancelled. Reporting a user's own choice
       as a provider failure is the kind of thing that gets a working app
       uninstalled.

       Note the asymmetry, which is deliberate: a REAL error still wins. `error`
       is checked first, so a request that failed and was then stopped is still
       reported as the failure it was. Stopping cannot mask a fault.

       Stopping WITH a partial answer was already fine — `failed` is null when
       currentAnswer is non-empty — and stays that way: a stopped answer is still
       an answer worth keeping. */
    // const failed = error || (!currentAnswer ? 'The model returned nothing. Retry the question.' : null)
    const stopped = opts.stopped === true && !currentAnswer && !error
    const failed = error || (!currentAnswer && !stopped
      ? 'The model returned nothing. Retry the question.'
      : null)

    const turn = {
      id: `${turns.length}-${currentQuestion.slice(0, 24)}`,
      q: currentQuestion,
      a: currentAnswer,
      said: currentSaid,   // SELF-VOICE 2026-08-31
      ts: Date.now(),      // wall clock — Dashboard renders this as a time of day
      source,
      // error,
      error: failed,
      // STOP-IS-NOT-AN-ERROR 2026-09-01: on the turn as well as in state, so
      // paging back to it with ⌘← still says "you stopped this" rather than
      // falling through to the generic "No answer came back."
      stopped,
      feedback: null,      // REDESIGN 2026-08-29: 'up' | 'down' from the card footer
    }
    // set({ isThinking: false, turns: [...turns, turn], activeTurnId: turn.id })
    /* PREMIUM-UX 2026-08-31: an answer that actually arrived is proof the block
       is over — a top-up landing mid-session has no other way to clear it now
       that the heartbeat no longer does. Only on a genuine answer, so a failed
       request cannot un-block the panel. */
    const unblocked = currentAnswer && !failed ? { blockedReason: null } : {}
    // set({ isThinking: false, answerPending: false, error: failed, turns: […], activeTurnId: turn.id })
    set({
      isThinking: false, answerPending: false, error: failed,
      stopped,   // STOP-IS-NOT-AN-ERROR 2026-09-01
      turns: [...turns, turn], activeTurnId: turn.id,
      ...unblocked,
    })
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

  // setError: (msg) => set({ error: msg, isThinking: false }),
  // PIPELINE 2026-08-31: a failed request must not leave the previous answer
  // sitting there waiting for a first token that is never coming.
  setError: (msg) => set({ error: msg, isThinking: false, answerPending: false }),

  /** Repoint the fast path at a stored turn. Cheap — no refetch. */
  /* PREMIUM-UX 2026-08-31 ─ paging must not destroy the live stream ───────────
     This overwrote currentQuestion, currentAnswer and isThinking with the stored
     turn — so pressing ⌘← while an answer was streaming replaced it outright,
     and there was no way back to the live one except paging forward to a turn
     that no longer held it.

     It now only says WHICH pair to display. The live pair is untouched and keeps
     streaming underneath, which is what makes going live again free. */
  // selectTurn: (id) => { set({ currentQuestion: turn.q, currentAnswer: turn.a, … }) },
  selectTurn: (id) => {
    const turn = get().turns.find((t) => t.id === id)
    if (!turn) return
    set({ pinnedTurnId: id, activeTurnId: id })
  },

  /** Back to the live pair. */
  goLive: () => set({ pinnedTurnId: null }),

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
  setCaptureState: (state, err = null) => {
    set({ captureState: state, captureError: err })
    /* PREMIUM-UX 2026-08-31: dead capture is the failure most worth surfacing —
       the panel otherwise reads "listening" over a microphone that is not
       running, and the user finds out only when nothing is ever answered. It is
       sticky because it stays true until something is done about it, and it is
       cleared the moment capture comes back. */
    if (state === 'failed' && err) {
      get().pushNotice({ kind: 'error', sticky: true, text: err })
    } else if (state === 'live') {
      get().clearNotices((n) => n.kind === 'error' && n.sticky)
    }
  },
  setScreenEnabled:   (v) => set({ screenEnabled: v }),
  setScreenPermission: (p) => set({
    screenPermission: p,
    // A revoked grant must not leave the toggle reading as on. 'not-determined'
    // is NOT a refusal — macOS has simply not asked yet, and the first
    // desktopCapturer call is what raises the prompt, so leave it enabled.
    screenEnabled: (p === 'denied' || p === 'restricted') ? false : get().screenEnabled,
  }),

  clearCurrent: () =>
    set({ currentQuestion: '', currentAnswer: '', isThinking: false, answerPending: false, error: null, stopped: false, activeTurnId: null }),

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
    set({ currentAnswer: '', questionAt: null, isThinking: false, answerPending: false, error: null, stopped: false }),

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
