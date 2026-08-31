import { useCallback, useEffect, useRef, useState } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { useSettingsStore } from '../store/settingsStore'
import { askAIStream } from '../services/aiRouter'
import { createUtteranceAggregator } from '../utils/utteranceAggregator'
import { createLogger } from '../utils/logger'
// SELF-VOICE 2026-08-31: the desktop mirror of lib/resume.js's tag stripping.
import { stripControlTags } from '../utils/utterance'
import { useVoice } from './useVoice'
import { useLiveVoice } from './useLiveVoice'
// SELF-VOICE 2026-08-31: the candidate's own microphone, captured alongside the
// interviewer's loopback. See that file's header for the whole argument.
import { useSelfVoice } from './useSelfVoice'

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
/* SELF-VOICE 2026-08-31 ─ a tag that names a SPEAKER, deliberately ────────────
   The note above states the rule this breaks: tags name the SURFACE a message
   came from, never who is at it. That rule was right when there was one audio
   stream — "heard" fully identified it.

   With the candidate's own microphone captured alongside the loopback there are
   two audio surfaces and "heard" no longer identifies anyone: both are heard.
   So [SAID] names the speaker, on purpose, and the prompt's WHO IS SPEAKING
   section is written around exactly that.

   buildSystemPrompt() reads these exact strings — change one, change both. And
   lib/resume.js's CONTROL_TAGS must strip it, or a résumé line beginning
   "[SAID] " is interpolated into the system prompt as something the candidate
   actually said out loud in this interview. */
const TAG = {
  // voice:  '[HEARD]',        // transcribed from the room; the candidate speaking
  // manual: '[INTERVIEWER]',  // typed into the transcript bar
  // chat:   '[INTERVIEWER]',  // typed into the chat thread
  voice:  '[HEARD]',        // transcribed from the captured audio
  self:   '[SAID]',         // transcribed from the candidate's own microphone
  manual: '[TYPED]',        // typed into the transcript bar
  chat:   '[TYPED]',        // typed into the chat thread
  screen: '[SCREENSHOT]',   // asked about a captured image
}

/**
 * Prefixes the tag. Handles both shapes the app sends: a plain string, and the
 * multimodal array a screenshot uses — where the tag belongs on the text part,
 * not on the image.
 */
/* SELF-VOICE 2026-08-31 ─ why `said` merges INTO the message, not beside it ────
   The candidate's lines could have been separate user messages. They are folded
   into the same one for two reasons:

     - consecutive same-role messages are a portability risk on Gemini's
       OpenAI-compatible surface, and this app switches providers by which key
       the server holds;
     - putting the antecedent immediately adjacent to the follow-up is where
       attention is strongest. "[SAID] …Redis cache… / [HEARD] Why?" reads as one
       exchange, which is what it is.

   Taken from the END when clipped: the referent of "why?" is the last thing
   said, never the first. */
const SELF_CHARS_PER_TURN = 600

function saidBlock(said) {
  if (!Array.isArray(said) || !said.length) return ''
  const lines = []
  let budget = SELF_CHARS_PER_TURN
  for (let i = said.length - 1; i >= 0; i--) {
    // SELF-VOICE 2026-08-31: a transcribed line that itself contains a tag could
    // otherwise claim to be a different speaker. See stripControlTags.
    const line = stripControlTags((said[i] || '').trim())
    if (!line) continue
    if (line.length > budget) break
    budget -= line.length
    lines.unshift(`${TAG.self} ${line}`)
  }
  return lines.length ? `${lines.join('\n')}\n` : ''
}

// SELF-VOICE 2026-08-31: `said` prepends the candidate's own lines to the same
// message. Optional, so every existing call site is unchanged.
// function tagContent(content, source) {
function tagContent(content, source, said) {
  const tag = TAG[source] || TAG.voice
  const prefix = saidBlock(said)

  // if (typeof content === 'string') return `${tag} ${content}`
  // SELF-VOICE 2026-08-31: strip any tag the text itself carries, for the same
  // reason lib/resume.js strips them out of a résumé — the tag decides who the
  // model thinks spoke, so text must never be able to supply its own.
  if (typeof content === 'string') return `${prefix}${tag} ${stripControlTags(content)}`

  if (Array.isArray(content)) {
    let tagged = false
    const parts = content.map((part) => {
      if (!tagged && part?.type === 'text') {
        tagged = true
        // SELF-VOICE 2026-08-31: the self lines go on the text part, never on
        // the image — same reason the tag itself does.
        // return { ...part, text: `${tag} ${part.text}` }
        return { ...part, text: `${prefix}${tag} ${stripControlTags(part.text)}` }
      }
      return part
    })
    // An array with no text part at all would otherwise go untagged.
    // return tagged ? parts : [{ type: 'text', text: tag }, ...parts]
    return tagged ? parts : [{ type: 'text', text: `${prefix}${tag}` }, ...parts]
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

  /* PREMIUM-UX 2026-08-31: true while the reader is at the live edge of the
     answer. AnswerPanel writes it from its scroll handler; generate() reads it
     to decide whether a new question may take the card. A ref for the same
     reason levelRef and partialRef are — it changes on every wheel tick. */
  const readerPinnedRef = useRef(true)

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
      /* PREMIUM-UX 2026-08-31: also a STICKY notice. blockedReason alone was not
         enough — applyHeartbeat used to null it on every tick, so a genuine
         out-of-credits call to action silently vanished within twenty seconds
         and the user was left with an app that had simply stopped answering. */
      store.pushNotice({
        kind: 'warn',
        sticky: true,
        text: e.message || 'You have run out of credits.',
        action: { label: 'Top up', href: '/dashboard/billing' },
      })
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
  /* CONTEXT 2026-08-31 ─ three turns loses the thread by the second follow-up ──
     An interview follow-up chain routinely runs four or five deep: "tell me
     about a time you improved performance" -> "why?" -> "and what happened?" ->
     "would you do it again?". At three turns the second "why" has already lost
     the original topic, which is exactly the reported symptom.

     Six turns at roughly 250 tokens each is ~1500 tokens, against a system
     prompt that already runs 1500-3000 with a resume attached. MAX_TOKENS in
     apps/web/lib/ai.js is the OUTPUT budget and is unaffected.

     Clipping is tiered rather than uniform: the model needs the TOPIC of an old
     answer but the TEXT of the immediately preceding one, because that is what
     "why did you say that" points at. 3x800 = 2400 chars becomes 2x800 + 4x400 =
     3200 — modest growth for double the depth. */
  // const HISTORY_TURNS = 3
  // const HISTORY_ANSWER_CHARS = 800
  const HISTORY_TURNS = 6
  const HISTORY_ANSWER_CHARS = 800      // the two most recent turns
  const HISTORY_ANSWER_CHARS_OLD = 400  // everything older
  const RECENT_FULL_TURNS = 2

  /* CONTEXT 2026-08-31: t.a.slice(n) cuts mid-word, and in Devanagari or
     Gujarati it can cut mid-grapheme — splitting a combining mark off the
     consonant it belongs to, or halving a UTF-16 surrogate pair. Back up to the
     last whitespace and mark the cut so the model knows it is reading an
     excerpt rather than a sentence that trailed off. */
  const clipAnswer = (text, limit) => {
    if (text.length <= limit) return text
    const cut = text.slice(0, limit)
    const lastSpace = cut.lastIndexOf(' ')
    return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
  }

  const recentHistory = useCallback(() => {
    const { turns } = useSessionStore.getState()
    const recent = turns.slice(-HISTORY_TURNS)
    return recent.flatMap((t, i) => {
      if (!t.q) return []
      /* CONTEXT 2026-08-31: a turn that failed with no answer contributed a lone
         user message, which puts two user messages back to back. That is noise
         rather than context, and consecutive same-role messages are a
         portability risk on Gemini's OpenAI-compatible surface. */
      if (!t.a) return []
      const fromEnd = recent.length - 1 - i
      const limit = fromEnd < RECENT_FULL_TURNS ? HISTORY_ANSWER_CHARS : HISTORY_ANSWER_CHARS_OLD
      return [
        // SELF-VOICE 2026-08-31: replay what the candidate actually said before
        // that question, so a follow-up two turns later still has its antecedent.
        // { role: 'user', content: tagContent(t.q, t.source || 'voice') },
        { role: 'user', content: tagContent(t.q, t.source || 'voice', t.said) },
        { role: 'assistant', content: clipAnswer(t.a, limit) },
      ]
    })
  }, [])

  // REDESIGN 2026-08-29: `content` is passed through rather than always being a
  // string, so the Screenshot button can send OpenAI's multimodal array shape.
  // messagesFor() in aiBackend only prepends the system prompt and never
  // inspects content, and /api/ai/chat forwards `messages` verbatim, so a
  // vision turn needs no service or route change.
  /* PIPELINE 2026-08-31 ─ `utterance`, a fourth optional parameter ────────────
     Carries the aggregator's emit payload so this can tell an EXTENSION of the
     question already on screen from a genuinely new one. Optional and trailing,
     so askManual, regenerate and askAboutScreen are untouched. */
  // const generate = useCallback(async (question, source = 'voice') => {
  // const generate = useCallback(async (question, source = 'voice', content = null) => {
  const generate = useCallback(async (question, source = 'voice', content = null, utterance = null) => {
    const q = question?.trim()
    if (!q) return

    const gen = ++genRef.current

    /* SEGMENTATION 2026-08-30: rescue the outgoing turn, then actually cancel it.

       Order matters and is the whole reason commitInterrupted is a separate
       action: setQuestion below blanks currentAnswer, so anything not saved by
       this line is gone. It no-ops unless a live, uncommitted pair exists. */
    /* PIPELINE 2026-08-31 ─ an extension is not a new question ─────────────────
       This is the fix for the reported "long questions break". When a cap forced
       an utterance out early, the rest of it arrived here as a brand-new
       question: commitInterrupted + setQuestion, which blanked the answer on
       screen and started again. A 40-second question therefore produced three or
       four LLM calls, each destroying the previous one's answer, with only the
       final fragment actually answered.

       The chain check is deliberately narrow. The aggregator has already decided
       this fragment continues a specific utterance AND that the speech resumed
       within continuationGapMs; this additionally requires that the utterance it
       names is the one THIS hook is currently showing, so a stale chain from
       before a manual question or a session boundary cannot splice itself in. */
    const chained = utterance?.continues != null
      && utterance.continues === chainIdRef.current

    const store = useSessionStore.getState()
    // Abort in BOTH branches: we must stop paying for an answer to half a
    // question. Only the store bookkeeping differs.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    let asked = q
    if (chained) {
      asked = store.extendQuestion(q)
    } else {
      store.commitInterrupted()
      /* SELF-VOICE 2026-08-31: take everything the candidate has said since the
         last question and attach it to THIS turn. Draining rather than reading:
         each line belongs to exactly one turn — the next question asked after
         it — so this gives no duplication and the right order for free.

         Drained after commitInterrupted, before setQuestion stores it. */
      /* PREMIUM-UX 2026-08-31 ─ do not take the answer off a reader ────────────
         If the candidate has deliberately scrolled up to re-read, hold the card
         on the turn commitInterrupted just wrote. The new question still
         supersedes and still streams — only the DISPLAY waits, and a badge in
         the card head offers the way forward.

         readerPinnedRef is true when they are at the live edge, which is the
         common case and behaves exactly as before. */
      const atEdge = readerPinnedRef.current !== false
      const lastTurn = useSessionStore.getState().turns.slice(-1)[0]
      const pinTo = !atEdge && lastTurn ? lastTurn.id : null

      const said = store.drainSelfSpeech()
      // keepAnswer: the previous answer stays readable until the first token of
      // the new one lands, instead of the card blanking to three dots.
      // store.setQuestion(q, source, { keepAnswer: true })
      store.setQuestion(q, source, { keepAnswer: true, said, pinTo })
    }

    // Remember which utterance the card is showing, so the NEXT emit can decide
    // whether it extends this one. Non-voice turns clear it: a typed question or
    // a screenshot ends whatever chain was running.
    chainIdRef.current = utterance ? (utterance.continues ?? utterance.id) : null

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
        // PIPELINE 2026-08-31: `asked`, not `q` — on a chained turn the question
        // that goes up is the MERGED one the store just assembled, not the
        // fragment that arrived. `q` remains correct for every other path.
        // SELF-VOICE 2026-08-31: currentSaid read back from the store rather
        // than closed over, so the chained branch — which does not drain — still
        // carries the self lines the head of the chain collected.
        // [...recentHistory(), { role: 'user', content: tagContent(content ?? q, source) }],
        // [...recentHistory(), { role: 'user', content: tagContent(content ?? asked, source) }],
        [...recentHistory(), {
          role: 'user',
          content: tagContent(content ?? asked, source, useSessionStore.getState().currentSaid),
        }],
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

  // PIPELINE 2026-08-31: which utterance the card is currently showing, so the
  // next emit can be recognised as its continuation. A ref, not state — nothing
  // renders from it.
  const chainIdRef = useRef(null)

  // Stable identity: useVoice tears down and re-acquires the mic if this changes.
  // PIPELINE 2026-08-31: takes the whole emit payload rather than just its text.
  // const onQuestion = useCallback((text) => generate(text, 'voice'), [generate])
  const onQuestion = useCallback((u) => {
    /* SELF-VOICE 2026-08-31: feed the echo backstop. These are the last few
       things the OTHER side said; speakerDedupe compares an incoming self line
       against them, so an interviewer sentence that came back through the
       candidate's speakers is dropped instead of being attributed to them.

       Kept short on purpose: an echo arrives within a second or two of the
       original, so a longer window only adds false positives. */
    const RECENT_REMOTE = 4
    recentRemoteRef.current = [...recentRemoteRef.current, u.text].slice(-RECENT_REMOTE)
    generate(u.text, 'voice', null, u)
  }, [generate])

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
  /* SELF-VOICE 2026-08-31 ─ the three refs the self-capture path needs ─────────
     All refs, none state: nothing renders from any of them, and putting them in
     state would re-run the capture effects and re-acquire the device.

     remoteSpeakingRef is the temporal echo gate. It mirrors the primary VAD's
     speaking state, and useSelfVoice discards any self speech that BEGINS while
     it is true — which on speakers is the interviewer's own voice coming back in
     through the microphone.

     recentRemoteRef is the text backstop's input: the last few things the
     interviewer said, for speakerDedupe to compare against.

     harvestSelfRef is filled in by useSelfVoice with its harvest function, so
     the aggregator's speech-start edge can reach it without this hook knowing
     anything about recorders. */
  const remoteSpeakingRef = useRef(false)
  const recentRemoteRef = useRef([])
  const harvestSelfRef = useRef(null)

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
      /* PIPELINE 2026-08-31: the payload, not just its text. emit has always
         carried reason, verdict, final and continues, and this dropped all of
         it — so generate() could not tell a forced mid-sentence truncation from
         a finished question and treated both as new. */
      // emit: (u) => { onQuestionRef.current?.(u.text) },
      emit: (u) => { onQuestionRef.current?.(u) },
      onHoldChange: (text) => { heldRef.current = text; partialRef.current = text },
      /* SELF-VOICE 2026-08-31: the interviewer starting to talk is, by
         construction, the candidate having stopped. Harvest there — the upload
         then overlaps the interviewer still speaking AND the aggregator's hold,
         so the text lands in the store before generate() is ever called.

         harvest() returns immediately; nothing here awaits anything. That is
         what keeps the "a COMPLETE question is never held" guarantee intact. */
      onSpeechStart: () => {
        remoteSpeakingRef.current = true
        harvestSelfRef.current?.('remote-speech')
      },
    })
  }

  /* SELF-VOICE 2026-08-31: the falling edge of the same signal. The aggregator
     has no onSpeechEnd option — noteSpeechEnd is called by the capture hooks, so
     this reads the state it already maintains rather than adding a second
     callback for one boolean. Polling on a frame is far cheaper than the render
     a state update would cost, and this is the same imperative pattern the level
     meter and the caption already use. */
  useEffect(() => {
    if (!isRunning) return
    let raf = 0
    const tick = () => {
      const agg = aggRef.current
      if (agg && !agg.isDisposed()) remoteSpeakingRef.current = agg.inspect().speaking
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isRunning])

  /* PIPELINE 2026-08-31 ─ one bad handshake used to cost the whole interview ───
     setLiveFailed(false) existed in exactly one place: start(). So a single
     transient SDP failure, ICE hiccup or device blip pinned the session to the
     segmented path — slower, and with no live caption — for the rest of the
     interview, with no way back short of ending it.

     Retry on the two gestures that already mean "try capture again": switching
     the source, and re-enabling capture. Both are explicit user actions and both
     already re-acquire the device.

     The latch is what keeps that from being a loop. giveUp() already passes a
     reason to onUnsupported and this callback simply threw it away; a 501 from
     our own backend means the server is on Gemini and realtime will NEVER work
     for this deploy, so that one reason sticks and the rest do not. */
  const liveUnsupportedRef = useRef(false)

  // const onLiveUnsupported = useCallback(() => {
  const onLiveUnsupported = useCallback((reason) => {
    if (reason === 'provider does not support realtime') liveUnsupportedRef.current = true
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

  /* PIPELINE 2026-08-31: the retry, gated on the latch above. isRunning is in
     the deps so a source switch made between sessions cannot fire this at a
     moment when there is nothing to re-acquire. */
  useEffect(() => {
    if (!isRunning) return
    if (liveUnsupportedRef.current) return
    setLiveFailed(false)
  }, [isRunning, captureSource, micEnabled])

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

  /* SELF-VOICE 2026-08-31 ─ the candidate's own microphone, alongside loopback ─
     Enabled only when the PRIMARY capture is system loopback. On 'mic' the
     primary already hears the whole room and there is no cheap way to separate
     the two speakers, so this stays off and buildSystemPrompt() adds a CAPTURE
     paragraph telling the model not to assert who spoke.

     Also off in 'followups' mode: that prompt is written for the interviewer, is
     never sent [SAID], and capturing for it would be paid-for work nobody reads.

     No new OS permission is needed — main.cjs already calls
     askForMediaAccess('microphone') at startup and the plist key is already
     shipped. */
  const answerMode = useSettingsStore((s) => s.answerMode)

  const onSelfSpeech = useCallback((text) => {
    useSessionStore.getState().appendSelfSpeech(text)
  }, [])

  useSelfVoice({
    enabled: isRunning && micEnabled && captureSource === 'system' && answerMode === 'answer',
    remoteSpeakingRef,
    harvestRef: harvestSelfRef,
    onSelfSpeech,
    recentRemoteRef,
  })

  const askManual = useCallback((text) => generate(text, 'manual'), [generate])

  const regenerate = useCallback(() => {
    const { currentQuestion, source } = useSessionStore.getState()
    if (currentQuestion) generate(currentQuestion, source)
  }, [generate])

  /* PIPELINE 2026-08-31 ─ three controls that could not actually stop anything ─
     abortRef lives here and the store cannot reach it, so every "stop" in the UI
     stopped only the WRITES. Three consequences, all user-visible:

       - Clear (⌘⌫) called sessionStore.clearAnswer, which touches neither genRef
         nor abortRef. The stream kept running, so appendAnswer repainted the
         card on the very next frame: the panel blanked and the answer visibly
         grew back.
       - There was no stop-generating at all. usePanelHotkeys' onStop is
         session.stop, which ends the whole billed interview — so a runaway
         answer could only be waited out.
       - sendChat passed no signal whatsoever, so a chat request could not be
         cancelled by anything, including this hook's own unmount cleanup. */

  const clearAnswer = useCallback(() => {
    genRef.current++
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
    bufRef.current = ''
    abortRef.current?.abort()
    abortRef.current = null
    useSessionStore.getState().clearAnswer()
  }, [])

  /**
   * Stops the answer without ending the session, keeping whatever arrived.
   *
   * Ordering is load-bearing. genRef is bumped BEFORE the abort so the in-flight
   * generation's own finally sees `gen !== genRef.current` and skips its
   * setAnswerDone — otherwise the turn commits twice. flush() runs before the
   * abort so the last frame's buffered tokens are not thrown away: a stopped
   * answer is still an answer worth keeping.
   */
  const stopGenerating = useCallback(() => {
    if (!useSessionStore.getState().isThinking) return
    genRef.current++
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
    flush()
    abortRef.current?.abort()
    abortRef.current = null
    useSessionStore.getState().setAnswerDone()
  }, [flush])

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
    // PIPELINE 2026-08-31: clear the realtime-unsupported latch too. start()
    // already gave every session a fresh attempt at the live path; the latch
    // must not be the thing that quietly takes that away.
    liveUnsupportedRef.current = false
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
        /* PREMIUM-UX 2026-08-31 ─ a paid interview used to just disappear ──────
           A server-side stop tore the panel down and MainApp swapped back to the
           launcher, whose own error state reads nothing from this store. The
           candidate's interview vanished mid-question with no explanation at
           all — no line, no reason, nothing to act on.

           A notice is plain data and stopSession deliberately does not clear it,
           so one pushed here survives the panel being unmounted and is rendered
           by the launcher on the other side. */
        const explain = {
          out_of_credits: {
            text: 'Your credits ran out, so the session ended.',
            action: { label: 'Top up', href: '/dashboard/billing' },
          },
          request_limit: {
            text: 'This session reached its request limit and ended.',
            action: { label: 'See plans', href: '/dashboard/billing' },
          },
          expired: { text: 'The session expired on the server. Nothing was lost — start again.' },
          license_revoked: { text: 'This licence was signed out from the dashboard.' },
        }[reason]

        // No notice for a stop the user asked for — they know why it ended.
        if (explain) {
          useSessionStore.getState().pushNotice({
            kind: 'warn', sticky: true, text: explain.text, action: explain.action || null,
          })
        }
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
  // PIPELINE 2026-08-31: chat had no AbortController at all — chatGenRef only
  // discarded the tokens while the socket stayed open and the request stayed
  // billed. The composer is disabled while streaming, so this mattered most on
  // teardown: signing out left a chat request running.
  const chatAbortRef = useRef(null)

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
    // PIPELINE 2026-08-31: supersede an in-flight chat request rather than
    // leaving it running and merely ignoring what it sends back.
    chatAbortRef.current?.abort()
    const controller = new AbortController()
    chatAbortRef.current = controller
    const store = useSessionStore.getState()
    store.startChatTurn(message)
    chatBufRef.current = ''
    let failure = null
    // PIPELINE 2026-08-31: an abort is neither a success nor a failure, and the
    // finally below has to be able to tell. Returning from the catch would not
    // do it — finally still runs, and setChatDone would then read the empty
    // assistant bubble as "the model returned nothing".
    let aborted = false

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
        // PIPELINE 2026-08-31: the signal parameter askAIStream has always had
        // on the voice path, finally passed here too.
        controller.signal,
      )
    } catch (e) {
      // PIPELINE 2026-08-31: an abort is a supersede, not a failure — the same
      // reasoning generate() applies. Without this, cancelling a chat request
      // paints a red error under the message that replaced it.
      if (e?.name === 'AbortError') aborted = true
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

        /* PIPELINE 2026-08-31: a cancelled request is neither. Keep whatever
           streamed, stop the spinner, and say nothing — failChatTurn would paint
           an error the user caused on purpose, and setChatDone would call an
           empty bubble a model failure. */
        if (aborted) {
          useSessionStore.setState({ chatStreaming: false })
        } else if (failure) {
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
    // PIPELINE 2026-08-31: the chat request was the one this cleanup could not
    // reach — it had no controller at all, so signing out mid-reply left it
    // running and billed.
    chatAbortRef.current?.abort()
    aggRef.current?.dispose()
  }, [])

  /* PIPELINE 2026-08-31: the chat mirror of stopGenerating. Same ordering, same
     reason — bump the counter first so the in-flight request's finally skips
     its own bookkeeping, then abort, then settle the thread here. */
  const stopChat = useCallback(() => {
    if (!useSessionStore.getState().chatStreaming) return
    chatGenRef.current++
    if (chatRafRef.current) { cancelAnimationFrame(chatRafRef.current); chatRafRef.current = 0 }
    flushChat()
    chatAbortRef.current?.abort()
    chatAbortRef.current = null
    useSessionStore.setState({ chatStreaming: false })
  }, [flushChat])

  const clearChat = useCallback(() => {
    stopChat()
    useSessionStore.getState().clearChat()
  }, [stopChat])

  // return { levelRef, start, stop, askManual, regenerate }
  // return { levelRef, start, stop, askManual, regenerate, askAboutScreen, sendChat }
  // LIVE CAPTION 2026-08-30: partialRef joins levelRef as the second ref handed
  // down for imperative painting. `live` is for chrome that wants to say which
  // path is running; nothing depends on it functionally.
  // SEGMENTATION 2026-08-30: discardHeld lets the Clear button drop a fragment
  // that is mid-hold. Without it, Clear wiped the painted caption while the
  // aggregator still held the text and answered it a second later.
  const discardHeld = useCallback(() => { aggRef.current?.reset() }, [])

  /* PIPELINE 2026-08-31: flushHeld releases what the aggregator is holding, on
     demand. flush() already existed on the aggregator and had zero callers — so
     during a hold of up to several seconds there was nothing at all the user
     could press: regenerate only re-sends the already-COMMITTED question, which
     is precisely the thing that does not exist yet while a fragment is held. */
  const flushHeld = useCallback(() => { aggRef.current?.flush('user') }, [])

  return {
    // levelRef, partialRef, live: !liveFailed, discardHeld,
    // start, stop, askManual, regenerate, askAboutScreen, sendChat,
    // PIPELINE 2026-08-31: heldRef is handed down so the transcript bar can show
    // that a hold is deliberate; the rest are the cancellation controls that had
    // no way out of this hook.
    levelRef, partialRef, heldRef, readerPinnedRef,
    live: !liveFailed, discardHeld, flushHeld,
    start, stop, askManual, regenerate, askAboutScreen, sendChat,
    stopGenerating, stopChat, clearAnswer, clearChat,
  }
}
