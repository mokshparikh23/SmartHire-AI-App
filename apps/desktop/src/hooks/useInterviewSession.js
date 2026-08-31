import { useCallback, useEffect, useRef, useState } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { useSettingsStore } from '../store/settingsStore'
import { askAIStream } from '../services/aiRouter'
import { createUtteranceAggregator } from '../utils/utteranceAggregator'
import { createLogger } from '../utils/logger'
import { useVoice } from './useVoice'
import { useLiveVoice } from './useLiveVoice'

const segLog = createLogger('seg')

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
/*
  PROMPT-TAGS 2026-08-30: which surface a message came from.

  buildSystemPrompt() branches on these, so they are part of the contract with
  the prompt rather than cosmetic — changing one means changing both.
*/
/* SYSTEM-AUDIO 2026-08-30: [INTERVIEWER] -> [TYPED].
   The tag names the SURFACE a message came from, and with capture moved to
   system audio the speaker on the other end is no longer necessarily an
   interviewer. [TYPED] describes the surface without asserting who is at it.
   buildSystemPrompt() reads these exact strings — change one, change both. */
const TAG = {
  // voice:  '[HEARD]',        // transcribed from the room; the candidate speaking
  // manual: '[INTERVIEWER]',  // typed into the transcript bar
  // chat:   '[INTERVIEWER]',  // typed into the chat thread
  voice:  '[HEARD]',        // transcribed from the captured audio
  manual: '[TYPED]',        // typed into the transcript bar
  chat:   '[TYPED]',        // typed into the chat thread
  screen: '[SCREENSHOT]',   // asked about a captured image
}

/**
 * Prefixes the tag. Handles both shapes the app sends: a plain string, and the
 * multimodal array a screenshot uses — where the tag belongs on the text part,
 * not on the image.
 */
function tagContent(content, source) {
  const tag = TAG[source] || TAG.voice

  if (typeof content === 'string') return `${tag} ${content}`

  if (Array.isArray(content)) {
    let tagged = false
    const parts = content.map((part) => {
      if (!tagged && part?.type === 'text') {
        tagged = true
        return { ...part, text: `${tag} ${part.text}` }
      }
      return part
    })
    // An array with no text part at all would otherwise go untagged.
    return tagged ? parts : [{ type: 'text', text: tag }, ...parts]
  }

  return content
}

export function useInterviewSession() {
  const isRunning  = useSessionStore((s) => s.isRunning)
  const micEnabled = useSessionStore((s) => s.micEnabled)
  // Changes on a click, not per token, so subscribing here is cheap.
  const captureSource = useSessionStore((s) => s.captureSource)

  const genRef   = useRef(0)   // increments to supersede an in-flight answer
  const levelRef = useRef(0)   // live mic RMS, read by the level meter's own rAF
  const bufRef   = useRef('')  // chunks awaiting the next frame
  const rafRef   = useRef(0)
  // SEGMENTATION 2026-08-30: genRef only ever discarded a superseded stream's
  // tokens. This actually stops it — see askAIStream's `signal`.
  const abortRef = useRef(null)

  // Stream deltas arrive one microtask apart, so an uncoalesced stream is one
  // React render per delta. Flushing on a frame caps that at ~60/s.
  const flush = useCallback(() => {
    rafRef.current = 0
    const text = bufRef.current
    if (!text) return
    bufRef.current = ''
    useSessionStore.getState().appendAnswer(text)
  }, [])

  /**
   * SESSION GATE 2026-08-29: 402 out_of_credits is not an error to print — it is
   * a state the overlay offers a top-up for. 403 means the licence itself is
   * gone. Everything else is an ordinary failure.
   */
  const reportFailure = useCallback((e) => {
    const store = useSessionStore.getState()
    if (e?.status === 402) {
      store.setError(e.message || 'You have run out of credits.')
      useSessionStore.setState({ blockedReason: e.code || 'out_of_credits' })
      return
    }
    store.setError(e?.message || 'The request failed.')
  }, [])

  /* SEGMENTATION 2026-08-30 ─ the voice path finally sends history ────────────
     Every [HEARD] question used to go up as a single-element messages array, so
     each answer was stateless. "aur struct se kya farak hai" — a follow-up that
     is only a follow-up — had no antecedent at all, and the model answered a
     question about nothing.

     Stitching makes this matter more rather than less: a question assembled
     across a pause is more likely to be the second half of a thought.

     Bounded on both axes. Three turns is enough for a follow-up to resolve
     without turning every question into a long prompt, and answers are clipped
     because the model needs to know what it said, not to re-read all of it.

     Every user turn is tagged, not just the last — the same reasoning sendChat
     records below: an untagged history drifts the model straight back to
     treating typed input as something overheard. */
  const HISTORY_TURNS = 3
  const HISTORY_ANSWER_CHARS = 800

  const recentHistory = useCallback(() => {
    const { turns } = useSessionStore.getState()
    return turns.slice(-HISTORY_TURNS).flatMap((t) => {
      if (!t.q) return []
      const pair = [{ role: 'user', content: tagContent(t.q, t.source || 'voice') }]
      if (t.a) pair.push({ role: 'assistant', content: t.a.slice(0, HISTORY_ANSWER_CHARS) })
      return pair
    })
  }, [])

  // REDESIGN 2026-08-29: `content` is passed through rather than always being a
  // string, so the Screenshot button can send OpenAI's multimodal array shape.
  // messagesFor() in aiBackend only prepends the system prompt and never
  // inspects content, and /api/ai/chat forwards `messages` verbatim, so a
  // vision turn needs no service or route change.
  // const generate = useCallback(async (question, source = 'voice') => {
  const generate = useCallback(async (question, source = 'voice', content = null) => {
    const q = question?.trim()
    if (!q) return

    const gen = ++genRef.current

    /* SEGMENTATION 2026-08-30: rescue the outgoing turn, then actually cancel it.

       Order matters and is the whole reason commitInterrupted is a separate
       action: setQuestion below blanks currentAnswer, so anything not saved by
       this line is gone. It no-ops unless a live, uncommitted pair exists. */
    useSessionStore.getState().commitInterrupted()

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    useSessionStore.getState().setQuestion(q, source)
    bufRef.current = ''

    try {
      await askAIStream(
        // PROMPT-TAGS 2026-08-30: the system prompt has always described three
        // surfaces and told the model to "read what you are given" — but nothing
        // was ever sent to distinguish them, and a transcribed line is the
        // documented DEFAULT. So a message typed in chat was answered as though
        // the candidate had said it out loud: type "Hi" and you got follow-up
        // questions about someone greeting you. The tag is what the prompt reads.
        // [{ role: 'user', content: q }],
        // [{ role: 'user', content: content ?? q }],
        // [{ role: 'user', content: tagContent(content ?? q, source) }],
        [...recentHistory(), { role: 'user', content: tagContent(content ?? q, source) }],
        (chunk) => {
          if (gen !== genRef.current) return     // a newer question took over
          bufRef.current += chunk
          if (!rafRef.current) rafRef.current = requestAnimationFrame(flush)
        },
        null,
        // Read at call time so changing the model mid-session takes effect.
        useSettingsStore.getState().model,
        // Same reason: the id is not known when this callback is created.
        useSessionStore.getState().sessionId,
        controller.signal,
      )
    } catch (e) {
      // if (gen === genRef.current) useSessionStore.getState().setError(e.message)
      // SEGMENTATION 2026-08-30: an abort is a supersede, not a failure. Without
      // this the act of replacing a question paints a red error over the answer
      // that replaced it.
      if (e?.name === 'AbortError') return
      if (gen === genRef.current) reportFailure(e)
    } finally {
      if (gen === genRef.current) {
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
        flush()
        useSessionStore.getState().setAnswerDone()
      }
    }
  // }, [flush, reportFailure])
  }, [flush, reportFailure, recentHistory])

  // Stable identity: useVoice tears down and re-acquires the mic if this changes.
  const onQuestion = useCallback((text) => generate(text, 'voice'), [generate])

  // SEGMENTATION 2026-08-30: the aggregator is built once and never rebuilt, so
  // its emit callback reads the CURRENT onQuestion through a ref rather than
  // closing over the one that existed when it was constructed.
  const onQuestionRef = useRef(onQuestion)
  onQuestionRef.current = onQuestion

  // REDESIGN 2026-08-29: the toolbar's mic toggle gates capture. micEnabled
  // changes on a click, not per token, so subscribing to it here is cheap —
  // unlike currentAnswer, which this hook must never subscribe to.
  /* LIVE CAPTION 2026-08-30 ───────────────────────────────────────────────────
     Two capture paths, exactly one running.

     useLiveVoice holds a WebRTC transcription session and paints text while the
     speaker is still talking. useVoice is the original: record a segment, upload
     it after a pause. The live path hands over on anything it cannot serve — the
     server being on the Gemini provider, a rejected SDP, ICE failure, the
     capture track dying — so the floor of this feature is the app as it was.

     liveFailed is state, not a ref, because the swap has to re-render: that is
     the whole point of it. It flips at most once per session and is reset by
     start(). */
  const [liveFailed, setLiveFailed] = useState(false)

  // Partial caption text. A REF on purpose — this updates several times a second
  // and sessionStore.js is explicit that high-frequency values must not go
  // through the store or through React state. TranscriptBar paints it from its
  // own rAF, the same way StatusIndicator paints levelRef.
  const partialRef = useRef('')

  /* SEGMENTATION 2026-08-30: the caption is now TWO things joined.

     `heldRef` is what the aggregator is holding across a pause; `text` is the
     deltas for whatever is being said right now. Writing only the latter — as
     this did — erases "So what is" from the screen the instant the speaker
     resumes, which is the exact moment the user most needs to see that their
     first half was kept. */
  const heldRef = useRef('')
  // const onPartial = useCallback((text) => { partialRef.current = text }, [])
  const onPartial = useCallback((text) => {
    const held = heldRef.current
    partialRef.current = held && text ? `${held} ${text}` : (held || text)
  }, [])

  /* SEGMENTATION 2026-08-30 ─ where the end of a question is decided ───────────
     Created HERE, not inside either capture hook, for three reasons:

       - it has to survive the live -> segmented handover with its held text
         intact, and a hook effect is torn down by exactly that switch;
       - a ref object has stable identity, so passing it through the hooks'
         dependency arrays cannot re-acquire the capture device;
       - onQuestion now has exactly one caller instead of two.

     onHoldChange drives the live caption. While a fragment is held, the partial
     text STAYS on screen — the user watches "So what is" persist across their
     own pause, which is the clearest possible signal that the app is waiting on
     purpose rather than having dropped the question. */
  const aggRef = useRef(null)
  /* PIPELINE 2026-08-31 ─ the aggregator died in dev and nobody noticed ───────
     main.jsx wraps the app in <React.StrictMode>, which in development runs
     every effect setup -> cleanup -> setup. The cleanup at the bottom of this
     hook calls aggRef.current.dispose(), and dispose() is one-way.

     A ref survives that simulated remount, so the guard below saw a non-null
     value and kept the DISPOSED instance. Every pushFragment then returned on
     its first line: zero questions emitted, for the whole dev session, silently
     — the level meter still animated and the caption simply stayed empty.

     That is almost certainly why so much of this pipeline shipped broken: the
     app could not be exercised in dev at all. Ask whether the ref holds a LIVE
     aggregator rather than merely a non-null one; that is the invariant this
     line always meant, and it is correct in production too, where the cleanup
     only runs on a genuine unmount. */
  // if (aggRef.current === null) {
  if (aggRef.current === null || aggRef.current.isDisposed()) {
    aggRef.current = createUtteranceAggregator({
      log: segLog,
      emit: (u) => { onQuestionRef.current?.(u.text) },
      onHoldChange: (text) => { heldRef.current = text; partialRef.current = text },
    })
  }

  const onLiveUnsupported = useCallback(() => {
    // Clear any half-written caption before the other path takes over, or it
    // would sit on screen as a question nobody asked.
    // SEGMENTATION 2026-08-30: the half-written part is the DELTAS, which die
    // with the WebRTC session. A held fragment is not half-written — it is a
    // complete fragment waiting for its continuation, the aggregator survives
    // the handover holding it, and the segmented path will join to it. So the
    // caption falls back to what is held rather than to nothing.
    // partialRef.current = ''
    partialRef.current = heldRef.current
    setLiveFailed(true)
  }, [])

  useLiveVoice({
    enabled: isRunning && micEnabled && !liveFailed,
    source: captureSource,
    // SEGMENTATION 2026-08-30: onQuestion -> aggRef. The hook reports fragments
    // and speech edges; the aggregator decides when a question has ended.
    // onQuestion,
    aggRef,
    onPartial,
    onUnsupported: onLiveUnsupported,
    levelRef,
  })

  // SYSTEM-AUDIO 2026-08-30: capture source comes from the store so the toolbar
  // can switch it mid-session. useVoice has it in its dependency array, so a
  // change re-acquires rather than relabelling the stream already running.
  // useVoice({ enabled: isRunning, onQuestion, levelRef })
  // useVoice({ enabled: isRunning && micEnabled, onQuestion, levelRef })
  // useVoice({ enabled: isRunning && micEnabled, source: captureSource, onQuestion, levelRef })
  useVoice({
    enabled: isRunning && micEnabled && liveFailed,
    source: captureSource,
    // SEGMENTATION 2026-08-30: onQuestion -> aggRef, as above. Both paths feed
    // the SAME aggregator instance, so a live -> segmented handover mid-question
    // keeps whatever was already held.
    // onQuestion,
    aggRef,
    levelRef,
  })

  const askManual = useCallback((text) => generate(text, 'manual'), [generate])

  const regenerate = useCallback(() => {
    const { currentQuestion, source } = useSessionStore.getState()
    if (currentQuestion) generate(currentQuestion, source)
  }, [generate])

  /* SESSION GATE 2026-08-29 ────────────────────────────────────────────────────
     The session has to be OPEN before the panel appears, because every AI call
     is gated on its id. Starting the UI first and the session second would give
     the user a live-looking overlay whose first question 402s.

     start() is therefore async and can fail. Callers must handle a false
     return — Dashboard's Start button shows the reason rather than entering
     session mode. */

  // const start = useCallback(() => {
  //   useSessionStore.getState().startSession()
  //   window.electronAPI?.enterSessionMode?.()
  // }, [])
  const start = useCallback(async () => {
    const result = await window.electronAPI?.startSession?.()

    if (!result?.ok) {
      useSessionStore.setState({
        error: result?.reason || 'Could not start the session.',
        blockedReason: result?.code || null,
      })
      return result || { ok: false }
    }

    // LIVE CAPTION 2026-08-30: a new session gets a fresh attempt at the live
    // path. Without this, one transient SDP failure would pin the app to the
    // segmented path for the rest of the process's life.
    partialRef.current = ''
    // SEGMENTATION 2026-08-30: drop anything held from the previous session
    // WITHOUT emitting it — a half-question from the last interview must not be
    // the first thing this one answers.
    aggRef.current?.reset()
    setLiveFailed(false)

    useSessionStore.getState().startSession(result)
    window.electronAPI?.enterSessionMode?.()
    return result
  }, [])

  // const stop = useCallback(() => {
  //   genRef.current++
  //   useSessionStore.getState().stopSession()
  //   window.electronAPI?.exitSessionMode?.()
  // }, [])
  // const stop = useCallback((reason = 'user_stopped') => {
  //   genRef.current++                    // orphan anything still streaming
  //   const { sessionId } = useSessionStore.getState()
  //   // Not awaited: the panel must close instantly. Settlement is the server's
  //   // job, and sweep_stale_sessions() backstops a stop that never lands.
  //   if (sessionId) window.electronAPI?.stopSession?.(sessionId, reason)
  //   useSessionStore.getState().stopSession()
  //   window.electronAPI?.exitSessionMode?.()
  // }, [])

  /** Tears down the panel without touching the network. Split out of stop() so
   *  main can report a session it has ALREADY settled without provoking a second
   *  round trip back at it. */
  const endLocally = useCallback(() => {
    genRef.current++                    // orphan anything still streaming
    // SEGMENTATION 2026-08-30: genRef alone only orphaned it. Stop it, and drop
    // any held fragment rather than firing an answer into a closing panel.
    abortRef.current?.abort()
    abortRef.current = null
    aggRef.current?.reset()
    partialRef.current = ''
    useSessionStore.getState().stopSession()
    window.electronAPI?.exitSessionMode?.()
  }, [])

  /* BUGFIX 2026-08-30 ─ the End button never reached the server ───────────────
     Three things were wrong here and any one of them was enough.

     `reason` was whatever the caller passed, and Toolbar handed it a React
     SyntheticEvent, which preload forwards to ipcRenderer.invoke(). Whether that
     failed as a synchronous contextBridge throw or an async invoke rejection
     decided only HOW it failed: synchronous meant the two lines at the bottom
     never ran and the panel stayed open; async meant the panel closed and the
     rejection was swallowed whole. Neither posted a stop. So the reason is
     coerced to a string HERE, at the boundary that owns it.

     The default is 'client_stop' — the value the end_reason CHECK actually names
     — rather than relying on session_stop() normalising anything it does not
     recognise. 'expired' and 'out_of_credits' coming from main stay as they are:
     by then the server has already closed the row with its own reason, and
     session_settle() returns the settled figures without overwriting it.

     The id is no longer a precondition. main falls back to liveSessionId, which
     it still holds after a reload has emptied this store — passing null is
     exactly what lets that fallback do its job.

     Still not awaited, for the original reason: the panel must close instantly.
     But a rejection is now logged instead of vanishing, and the try/catch
     guarantees the panel closes even if the bridge throws synchronously. */
  const stop = useCallback((reason) => {
    const { sessionId } = useSessionStore.getState()
    const why = typeof reason === 'string' && reason ? reason : 'client_stop'

    try {
      window.electronAPI?.stopSession?.(sessionId ?? null, why)
        ?.catch?.((e) => console.error('[session] stop was rejected by main:', e))
    } catch (e) {
      console.error('[session] stop could not cross the context bridge:', e)
    }

    endLocally()
  }, [endLocally])

  /**
   * Advances the meter on the cadence the server asked for.
   *
   * `stop: true` comes back with HTTP 200 — it means the credits ran out, which
   * ends the session normally. A 503 is "retry", not a verdict, so it is
   * ignored here and the next beat tries again.
   */
  // useEffect(() => {
  //   if (!isRunning) return
  //   const { heartbeatSeconds } = useSessionStore.getState()
  //
  //   const beat = async () => {
  //     const { sessionId } = useSessionStore.getState()
  //     if (!sessionId) return
  //
  //     const result = await window.electronAPI?.heartbeatSession?.(sessionId)
  //     if (!result) return
  //
  //     if (result.ok) {
  //       useSessionStore.getState().applyHeartbeat(result)
  //       if (result.stop) stop(result.reason || 'out_of_credits')
  //       return
  //     }
  //     // 410 = the session is gone. Stop, but stay signed in.
  //     if (result.code === 'no_session') stop('expired')
  //   }
  //
  //   const id = setInterval(beat, Math.max(5, heartbeatSeconds) * 1000)
  //   return () => clearInterval(id)
  // }, [isRunning, stop])

  /* SESSION OWNERSHIP 2026-08-30 ─ main drives the meter, this only listens ───
     The timer above was in the wrong process. It lived in a renderer whose
     store has no persist middleware, so a reload or a Vite full refresh reset
     isRunning and lost sessionId — after which nothing here could close the row
     it had opened, and the server labelled it 'superseded' or 'stale'. And
     Chromium throttles a hidden window's setInterval toward once a minute
     against a ninety-second stale window, so ⌘⇧H alone could kill a session.

     It also had the direction of control backwards: a server-side stop (out of
     credits, request limit, licence revoked) could only reach the UI through
     the renderer's own timer, which is the thing that had already failed.

     No isRunning guard. main only emits while a session is open, and a tick
     arriving just after a local stop must still be applied — it carries the
     final balance. */
  useEffect(() => {
    const offTick = window.electronAPI?.onSessionTick?.((data) => {
      useSessionStore.getState().applyHeartbeat(data)
    })
    const offEnded = window.electronAPI?.onSessionEnded?.(({ reason }) => {
      // endLocally, NOT stop: main has already settled with the server, and
      // posting again would be a second round trip whose only effect is to make
      // session_settle() return the figures it already wrote.
      if (useSessionStore.getState().isRunning) {
        useSessionStore.setState({ blockedReason: reason || null })
        endLocally()
      }
    })
    return () => { offTick?.(); offEnded?.() }
  }, [endLocally])

  /* REDESIGN 2026-08-29 ─ Screenshot ──────────────────────────────────────────
     Captures the screen the panel is on and asks about it in one step. The
     overlay excludes itself from the capture via setContentProtection(true), so
     the model sees the interview, not our own UI. */

  const askAboutScreen = useCallback(async () => {
    const shot = await window.electronAPI?.captureScreen?.()

    if (!shot?.ok) {
      if (shot?.code === 'denied') {
        useSessionStore.getState().setScreenPermission('denied')
        useSessionStore.getState().setError(
          'Screen Recording permission is needed. Open System Settings to grant it.'
        )
        return
      }
      useSessionStore.getState().setError(shot?.reason || 'Could not capture the screen.')
      return
    }

    const { currentQuestion } = useSessionStore.getState()
    const prompt = currentQuestion?.trim() || 'What is on screen?'

    await generate(prompt, 'screen', [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: shot.dataUrl } },
    ])
  }, [generate])

  /* REDESIGN 2026-08-29 ─ Chat ────────────────────────────────────────────────
     A separate thread from the Q→A fast path. It reuses the same rAF coalescing
     as generate() — an uncoalesced stream is one React render per delta. */

  const chatGenRef = useRef(0)
  const chatBufRef = useRef('')
  const chatRafRef = useRef(0)

  const flushChat = useCallback(() => {
    chatRafRef.current = 0
    const text = chatBufRef.current
    if (!text) return
    chatBufRef.current = ''
    useSessionStore.getState().appendChat(text)
  }, [])

  const sendChat = useCallback(async (text) => {
    const message = text?.trim()
    if (!message) return

    const gen = ++chatGenRef.current
    const store = useSessionStore.getState()
    store.startChatTurn(message)
    chatBufRef.current = ''
    let failure = null

    // The full thread, so the model has the conversation — minus the empty
    // assistant turn startChatTurn just pushed for the reply to stream into.
    //
    // PROMPT-TAGS 2026-08-30: every user turn is tagged [TYPED] (this said
    // [INTERVIEWER] until the tag was renamed with system audio). Without it the
    // prompt's documented default applies and the model answers chat as if it
    // were a line overheard in the room — "Hi" came back as follow-up questions
    // about someone saying hello. Tagging only the last message would not do: on
    // the second turn the model sees an untagged history and drifts straight
    // back to treating it as transcript.
    const history = useSessionStore.getState().chatMessages
      .slice(0, -1)
      .map(({ role, content }) => ({
        role,
        content: role === 'user' ? tagContent(content, 'chat') : content,
      }))

    try {
      await askAIStream(
        history,
        (chunk) => {
          if (gen !== chatGenRef.current) return
          chatBufRef.current += chunk
          if (!chatRafRef.current) chatRafRef.current = requestAnimationFrame(flushChat)
        },
        null,
        useSettingsStore.getState().model,
        useSessionStore.getState().sessionId,
      )
    } catch (e) {
      // BUGFIX 2026-08-30: reportFailure writes to `error`, which only
      // AnswerPanel renders — in chat mode that meant a silent failure and a
      // blank assistant bubble. Route chat failures to the chat's own field.
      // if (gen === chatGenRef.current) reportFailure(e)
      failure = e
    } finally {
      if (gen === chatGenRef.current) {
        if (chatRafRef.current) { cancelAnimationFrame(chatRafRef.current); chatRafRef.current = 0 }
        // Flush BEFORE failChatTurn either way: whatever partial text arrived
        // belongs in the bubble, and failChatTurn only drops the bubble if it
        // is still empty after this.
        flushChat()

        if (failure) {
          // Out of credits is session-wide, so it still sets blockedReason —
          // the thread reads that to offer a top-up instead of an error line.
          if (failure.status === 402) {
            useSessionStore.setState({ blockedReason: failure.code || 'out_of_credits' })
          }
          useSessionStore.getState().failChatTurn(failure.message)
        } else {
          useSessionStore.getState().setChatDone()
        }
      }
    }
  }, [flushChat])

  // Unmounting (sign-out, licence revoked) must not leave a stream writing.
  // useEffect(() => () => { genRef.current++ }, [])
  // useEffect(() => () => { genRef.current++; chatGenRef.current++ }, [])
  // SEGMENTATION 2026-08-30: abort and dispose too. The counters stopped the
  // WRITES; the request itself kept running and being billed for.
  useEffect(() => () => {
    genRef.current++
    chatGenRef.current++
    abortRef.current?.abort()
    aggRef.current?.dispose()
  }, [])

  // return { levelRef, start, stop, askManual, regenerate }
  // return { levelRef, start, stop, askManual, regenerate, askAboutScreen, sendChat }
  // LIVE CAPTION 2026-08-30: partialRef joins levelRef as the second ref handed
  // down for imperative painting. `live` is for chrome that wants to say which
  // path is running; nothing depends on it functionally.
  // SEGMENTATION 2026-08-30: discardHeld lets the Clear button drop a fragment
  // that is mid-hold. Without it, Clear wiped the painted caption while the
  // aggregator still held the text and answered it a second later.
  const discardHeld = useCallback(() => { aggRef.current?.reset() }, [])

  return {
    levelRef, partialRef, live: !liveFailed, discardHeld,
    start, stop, askManual, regenerate, askAboutScreen, sendChat,
  }
}
