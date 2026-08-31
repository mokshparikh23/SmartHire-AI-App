import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { useSettingsStore } from '../../store/settingsStore'
// PREMIUM-UX 2026-08-31: useStallWatch distinguishes "in flight" from "the
// server has gone quiet"; Notices is the error surface the next question cannot
// wipe.
import { usePanelOpacity, usePanelHotkeys, useStallWatch } from '../../hooks/useOverlay'
import Notices from './Notices'
// PREMIUM-UX 2026-08-31: rendered FROM the bindings list, so it cannot teach a
// chord that no longer works.
import HotkeySheet from './HotkeySheet'
import Toolbar from './Toolbar'
import TranscriptBar from './TranscriptBar'
import AnswerPanel, { AnswerCardHead } from './AnswerPanel'
import ChatPanel from './ChatPanel'
import TurnPager, { TurnDrawer } from './TurnPager'
import '../../styles/overlay.css'

/**
 * The floating panel shown while a session is running.
 *
 * The window is sized to this panel by the main process, so everything outside
 * its rounded corners is empty screen — clicks there reach the app behind
 * because our window is not there at all.
 *
 * REDESIGN 2026-08-29: three detached bars rather than one fused card. They
 * share one width on purpose: the window still has to be a single rectangle, so
 * bars of differing widths would only add dead click area at the edges. The
 * ~10px gaps between them are the whole cost of the detached look.
 */
export default function SessionPanel({ session }) {
  const stageRef = useRef(null)

  // Narrow subscriptions only. currentAnswer is subscribed inside AnswerPanel,
  // so a streamed token re-renders that leaf and nothing else.
  const question     = useSessionStore((s) => s.currentQuestion)
  /* PIPELINE 2026-08-31: a BOOLEAN, deliberately. It flips at most once per
     turn — when the first token lands — so this costs one panel render per
     answer, not one per token. Subscribing to currentAnswer itself here would
     break the contract this file's header states. */
  const hasAnswer    = useSessionStore((s) => !!s.currentAnswer)
  const source       = useSessionStore((s) => s.source)
  const isThinking   = useSessionStore((s) => s.isThinking)
  const turns        = useSessionStore((s) => s.turns)
  const activeTurnId = useSessionStore((s) => s.activeTurnId)
  // PREMIUM-UX 2026-08-31: which pair the card is SHOWING. Changes at most once
  // per turn, so subscribing here costs nothing on the streaming path.
  const pinnedTurnId = useSessionStore((s) => s.pinnedTurnId)
  const goLive       = useSessionStore((s) => s.goLive)
  const captureState = useSessionStore((s) => s.captureState)
  const selectTurn   = useSessionStore((s) => s.selectTurn)
  const chatMode     = useSessionStore((s) => s.chatMode)
  // Count, not the array — the head only needs to know whether Clear is live,
  // and subscribing to chatMessages here would re-render the whole panel on
  // every streamed chat token. ChatPanel is the only subscriber to the array.
  const chatCount    = useSessionStore((s) => s.chatMessages.length)
  const micEnabled   = useSessionStore((s) => s.micEnabled)

  const overlayOpacity = useSettingsStore((s) => s.overlayOpacity)
  // ANSWER-STYLE 2026-08-30: the card holds follow-ups rather than an answer in
  // the default mode, and the Clear title has to say which.
  const followups      = useSettingsStore((s) => s.answerMode === 'followups')
  // The stage carries --ia-alpha now, so all three bars inherit one value.
  usePanelOpacity(stageRef, overlayOpacity)

  const [typing, setTyping]         = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed]   = useState(false)

  /* PREMIUM-UX 2026-08-31 ─ ending a paid interview needs two presses ─────────
     ⌘⇧X and the End pill both called session.stop() outright. That closes the
     metered session on the server; there is no undo, the panel disappears, and
     the chord appeared in no tooltip, no chip and no menu — so the first time
     most users met it was by accident.

     Two-step rather than a modal: a modal over an always-on-top overlay during a
     live call is worse than the problem. The pill says what the second press
     will do and reverts on its own. */
  const ARM_MS = 3000
  const [arming, setArming] = useState(false)
  const armTimerRef = useRef(0)
  // The decision "is this the second press?" has to be readable SYNCHRONOUSLY
  // inside the handler. A setState updater does not run at the call site in
  // React 18, so the flag lives in a ref and the state exists only to repaint.
  const armedRef = useRef(false)

  const requestStop = useCallback(() => {
    if (armTimerRef.current) { clearTimeout(armTimerRef.current); armTimerRef.current = 0 }

    if (armedRef.current) {
      armedRef.current = false
      setArming(false)
      session.stop()
      return
    }

    armedRef.current = true
    setArming(true)
    armTimerRef.current = setTimeout(() => {
      armTimerRef.current = 0
      armedRef.current = false
      setArming(false)
    }, ARM_MS)
  }, [session])

  useEffect(() => () => { if (armTimerRef.current) clearTimeout(armTimerRef.current) }, [])

  // The window shrinks with the collapsed panel. Without this the hidden bars
  // leave an invisible rectangle that still swallows clicks — the exact problem
  // sizing the window to the panel exists to avoid.
  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      const next = !v
      window.electronAPI?.setOverlayCollapsed?.(next)
      return next
    })
  }, [])

  /* PREMIUM-UX 2026-08-31 ─ focus mode ────────────────────────────────────────
     The answer body is about eleven lines, and a long answer simply did not fit
     — the panel has never been resizable during a session. ⌘⇧F (and the card
     head's expand button, which finally does what its icon says) grows the
     window downward for reading and Esc puts it back.

     `data-focus` on the stage lets the CSS loosen the answer's line-height when
     there is room, which is the whole point of having asked for the room. */
  const [focused, setFocused] = useState(false)
  // PREMIUM-UX 2026-08-31: the shortcut sheet, opened by `?` or from the ⋮ menu.
  const [helpOpen, setHelpOpen] = useState(false)

  /* PLACEMENT 2026-09-01 ─ the six-zone picker ─────────────────────────────────
     Held here rather than in Toolbar because ⌘⇧M is a GLOBAL shortcut: main
     hears it whether or not this window has focus, focuses the window, and sends
     overlay:movePicker. The panel is where that lands, and the Escape chain
     below is where it has to be closed from. */
  const [moveOpen, setMoveOpen] = useState(false)

  useEffect(() => {
    // Returns its own unsubscribe (see preload.cjs), so this removes exactly the
    // listener it added.
    return window.electronAPI?.onMovePicker?.(() => setMoveOpen(true))
  }, [])

  const toggleFocus = useCallback(() => {
    setFocused((v) => {
      const next = !v
      window.electronAPI?.setOverlayFocus?.(next)
      return next
    })
  }, [])

  const exitFocus = useCallback(() => {
    setFocused((v) => {
      if (v) window.electronAPI?.setOverlayFocus?.(false)
      return false
    })
  }, [])

  // The Screen Recording grant can be revoked while the app is open, and
  // askForMediaAccess cannot request it — so read it on mount and let the
  // toggle offer System Settings when it is denied.
  useEffect(() => {
    let cancelled = false
    window.electronAPI?.getScreenPermission?.().then((p) => {
      if (!cancelled && p) useSessionStore.getState().setScreenPermission(p)
    })
    return () => { cancelled = true }
  }, [])

  const copy = useCallback((text) => {
    if (text) window.electronAPI?.copyText?.(text)
  }, [])

  const submitTyped = useCallback((text) => {
    setTyping(false)
    session.askManual(text)
  }, [session])

  /* PIPELINE 2026-08-31 ─ one handler for Clear-transcript, not two ────────────
     The ⌘⇧⌫ hotkey called clearTranscript() bare while the transcript bar's own
     Clear button also called discardHeld() and blanked partialRef. So the chord
     wiped the committed question but left the HELD fragment alive — and it
     repainted itself a frame later and was still answered once its hold expired.
     That is the exact bug the button's own comment says was fixed; the keyboard
     path simply never got the fix. */
  const clearTranscript = useCallback(() => {
    session.discardHeld?.()
    if (session.partialRef) session.partialRef.current = ''
    useSessionStore.getState().clearTranscript()
  }, [session])

  const stepTurn = useCallback((delta) => {
    const { turns: list, activeTurnId: active } = useSessionStore.getState()
    if (!list.length) return
    const index = list.findIndex((t) => t.id === active)
    const from  = index === -1 ? list.length - 1 : index
    const next  = Math.min(list.length - 1, Math.max(0, from + delta))
    selectTurn(list[next].id)
  }, [selectTurn])

  usePanelHotkeys({
    onType:  () => setTyping(true),
    // PREMIUM-UX 2026-08-31: ⌘⇧X went straight to stop(), which closes the
    // metered session with no undo. It now arms the End pill instead.
    // onStop:  session.stop,
    onStop:  requestStop,
    onRetry: session.regenerate,
    onCopy:  () => copy(useSessionStore.getState().currentAnswer),

    /* PIPELINE 2026-08-31: ⌘↵ was regenerate, which re-sends the COMMITTED
       question — useless during a hold, which is exactly the moment the user is
       staring at unmoving text wondering whether the app has died. If something
       is held, release it; otherwise behave as before. */
    // onAnswer:          session.regenerate,
    onAnswer: () => {
      if (session.heldRef?.current) { session.flushHeld?.(); return }
      session.regenerate()
    },
    // PIPELINE 2026-08-31: ⌘. is the macOS "stop". It stops the ANSWER; ⌘⇧X
    // (two-step, above) is what stops the session.
    onStopGenerating: () => {
      const s = useSessionStore.getState()
      s.chatMode ? session.stopChat?.() : session.stopGenerating?.()
    },
    onFocus: toggleFocus,
    onGoLive: goLive,
    onHelp: () => setHelpOpen((v) => !v),
    /* PREMIUM-UX 2026-08-31: the Esc precedence chain. Most-recently-opened
       first, and it deliberately ends at "do nothing" — Esc must never be a
       route to ending a paid session, however deep the chain gets. */
    onEscape: () => {
      // PLACEMENT 2026-09-01: first, because it is the most recently opened —
      // ⌘⇧M can be pressed over anything else already on screen. MovePicker
      // deliberately does not handle Escape itself; splitting the unwind order
      // across two files is how that order silently goes wrong.
      if (moveOpen)   { setMoveOpen(false); return }
      if (helpOpen)   { setHelpOpen(false); return }
      if (typing)     { setTyping(false); return }
      if (drawerOpen) { setDrawerOpen(false); return }
      if (focused)    { exitFocus(); return }
      if (pinnedTurnId) { goLive(); return }
      if (arming)     { armedRef.current = false; setArming(false); return }
      // Nothing to back out of.
    },
    onScreenshot:      session.askAboutScreen,
    onChat:            () => useSessionStore.getState().toggleChat(),
    // onClearTranscript: () => useSessionStore.getState().clearTranscript(),
    onClearTranscript: clearTranscript,
    // ⌘⌫ clears whatever the card is showing, matching the chip in its head.
    // PIPELINE 2026-08-31: through the hook's aborting versions — the store's
    // clearAnswer left the stream running and the text grew straight back.
    // onClearAnswer: () => { const s = …; s.chatMode ? s.clearChat() : s.clearAnswer() },
    onClearAnswer:     () => {
      const s = useSessionStore.getState()
      s.chatMode ? session.clearChat?.() : session.clearAnswer?.()
    },
    onPrev:            () => stepTurn(-1),
    onNext:            () => stepTurn(1),
  })

  /* PREMIUM-UX 2026-08-31 ─ a state machine, rather than one ternary ──────────
     The line this replaces was the ENTIRE visual state machine, and it drove
     nothing but the colour of three 2.5px bars. Idle and listening rendered
     identically, and there was no state at all for the two that matter most:

       deaf — micEnabled says the user WANTS capture on. It is set by a toolbar
         click and by nothing else, and knew nothing about whether acquire()
         actually succeeded. So the chip sat green over dead capture in three
         separate failure paths, which is as misleading as this panel gets.

       slow — a request in flight with nothing back yet looked exactly like one
         that had stopped responding.

     Order is by severity: a broken thing outranks a busy thing, which outranks
     an idle one. */
  // const state = isThinking ? 'thinking' : micEnabled ? 'listening' : 'paused'
  const slow = useStallWatch(isThinking && !hasAnswer)

  const state =
    !micEnabled                  ? 'paused'
    : captureState === 'failed'  ? 'deaf'
    : slow                       ? 'slow'
    : isThinking && hasAnswer    ? 'writing'
    : isThinking                 ? 'thinking'
    :                              'listening'

  return (
    // PREMIUM-UX 2026-08-31: data-focus lets the CSS loosen the answer's
    // line-height when focus mode has bought the room for it.
    // <div className="ia-stage" ref={stageRef}>
    <div className="ia-stage" ref={stageRef} data-focus={focused}>
      {helpOpen && <HotkeySheet onClose={() => setHelpOpen(false)} />}

      {/* PREMIUM-UX 2026-08-31: above the toolbar and flex-shrink:0, so a notice
          never steals height from the answer and never covers a control. */}
      <Notices />

      <div className="ia-glass ia-bar ia-bar--toolbar">
        <Toolbar
          session={session}
          // PREMIUM-UX 2026-08-31: both routes to ending a session go through
          // the same two-step gate, so the pill and the chord cannot disagree.
          // onEnd={session.stop}
          onEnd={requestStop}
          endArming={arming}
          onToggleCollapse={toggleCollapsed}
          onHelp={() => setHelpOpen(true)}
          moveOpen={moveOpen}
          onMoveOpenChange={setMoveOpen}
        />
      </div>

      {/* Collapsed keeps only the toolbar, for when the panel is in the way but
          ending the session is not what the user wants. */}
      {!collapsed && (
        <>
          <TranscriptBar
            question={question}
            source={source}
            typing={typing}
            state={state}
            levelRef={session.levelRef}
            partialRef={session.partialRef}
            // PREMIUM-UX 2026-08-31: heldRef drives the "waiting for the rest…"
            // state, and onAnswerNow releases what is held on demand.
            heldRef={session.heldRef}
            onAnswerNow={() => session.flushHeld?.()}
            onSubmit={submitTyped}
            onCancelTyping={() => setTyping(false)}
            // LIVE CAPTION 2026-08-30: the live caption lives in a ref, so
            // clearTranscript() alone would wipe the committed question and
            // leave a half-spoken sentence painted over the top of it.
            // SEGMENTATION 2026-08-30: and the ref is no longer the whole
            // story — a held fragment would repaint itself a frame later and,
            // worse, still be answered once its hold expired.
            // PIPELINE 2026-08-31: hoisted to one `clearTranscript` handler
            // above, so the ⌘⇧⌫ chord runs exactly the same three steps this
            // button always did rather than only the last of them.
            // onClear={() => { session.discardHeld?.(); … }}
            onClear={clearTranscript}
            onExpand={() => setTyping((v) => !v)}
          />

          <div className="ia-glass ia-bar ia-bar--card">
            {/* The pager and Clear belong to the ANSWER. In chat mode they would
                page turns you cannot see and clear an answer you are not looking
                at, so the head swaps to the chat's own clear. */}
            <AnswerCardHead
              // PIPELINE 2026-08-31: through the hook, which aborts the stream.
              // The store's clearAnswer blanked the card and the answer visibly
              // grew back on the next frame.
              // onClear={() => chatMode ? …clearChat() : …clearAnswer()}
              onClear={() => chatMode ? session.clearChat?.() : session.clearAnswer?.()}
              // PIPELINE 2026-08-31: gated on `question`, so after ⌘⇧⌫ cleared
              // the transcript the Clear that would remove the still-visible
              // ANSWER was disabled. Either one showing is reason enough.
              // canClear={chatMode ? chatCount > 0 : !!question}
              canClear={chatMode ? chatCount > 0 : (!!question || hasAnswer)}
              // Same key in both modes — it clears whatever the card is showing.
              // ⌘⇧⌫ is the transcript bar's, which stays visible in chat mode,
              // so reusing it here would give one chord two meanings on screen.
              clearCombo="mod del"
              // ANSWER-STYLE 2026-08-30: a third arm. Outside chat the card holds
              // follow-ups by default now, not an answer.
              // clearTitle={chatMode ? 'Clear the chat' : 'Clear the answer'}
              clearTitle={chatMode
                ? 'Clear the chat'
                : followups ? 'Clear the suggestion' : 'Clear the answer'}
              /* PREMIUM-UX 2026-08-31: this button carried the `expand` icon and
                 the title "Expand" and toggled the turn DRAWER — while the
                 identical icon and title on the transcript bar toggled the type
                 input. Two unrelated behaviours behind one label, neither of
                 which expanded anything.

                 It now does what its icon says. The drawer is still one click
                 away on the pager beside it, which is where history belongs. */
              // onExpand={() => setDrawerOpen((v) => !v)}
              onExpand={toggleFocus}
              expanded={focused}
              // PREMIUM-UX 2026-08-31: the way back to the live pair.
              pinned={!!pinnedTurnId}
              liveThinking={isThinking}
              onGoLive={goLive}
            >
              {!chatMode && (
                <TurnPager
                  turns={turns}
                  activeTurnId={activeTurnId}
                  onSelect={selectTurn}
                  drawerOpen={drawerOpen}
                  onToggleDrawer={() => setDrawerOpen((v) => !v)}
                />
              )}
              {chatMode && <span className="ia-label">Chat</span>}
            </AnswerCardHead>

            {!chatMode && drawerOpen && turns.length > 0 && (
              <TurnDrawer
                turns={turns}
                activeTurnId={activeTurnId}
                onSelect={(id) => { selectTurn(id); setDrawerOpen(false) }}
              />
            )}

            {chatMode
              ? <ChatPanel onSend={session.sendChat} />
              : <AnswerPanel
                  onRetry={session.regenerate}
                  onRefine={session.refine}
                  readerPinnedRef={session.readerPinnedRef}
                />}
          </div>
        </>
      )}
    </div>
  )
}
