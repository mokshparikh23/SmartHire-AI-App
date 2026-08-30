import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { useSettingsStore } from '../../store/settingsStore'
import { usePanelOpacity, usePanelHotkeys } from '../../hooks/useOverlay'
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
  const source       = useSessionStore((s) => s.source)
  const isThinking   = useSessionStore((s) => s.isThinking)
  const turns        = useSessionStore((s) => s.turns)
  const activeTurnId = useSessionStore((s) => s.activeTurnId)
  const selectTurn   = useSessionStore((s) => s.selectTurn)
  const chatMode     = useSessionStore((s) => s.chatMode)
  // Count, not the array — the head only needs to know whether Clear is live,
  // and subscribing to chatMessages here would re-render the whole panel on
  // every streamed chat token. ChatPanel is the only subscriber to the array.
  const chatCount    = useSessionStore((s) => s.chatMessages.length)
  const micEnabled   = useSessionStore((s) => s.micEnabled)

  const overlayOpacity = useSettingsStore((s) => s.overlayOpacity)
  // The stage carries --ia-alpha now, so all three bars inherit one value.
  usePanelOpacity(stageRef, overlayOpacity)

  const [typing, setTyping]         = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed]   = useState(false)

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
    onStop:  session.stop,
    onRetry: session.regenerate,
    onCopy:  () => copy(useSessionStore.getState().currentAnswer),

    onAnswer:          session.regenerate,
    onScreenshot:      session.askAboutScreen,
    onChat:            () => useSessionStore.getState().toggleChat(),
    onClearTranscript: () => useSessionStore.getState().clearTranscript(),
    // ⌘⌫ clears whatever the card is showing, matching the chip in its head.
    onClearAnswer:     () => {
      const s = useSessionStore.getState()
      s.chatMode ? s.clearChat() : s.clearAnswer()
    },
    onPrev:            () => stepTurn(-1),
    onNext:            () => stepTurn(1),
  })

  const state = isThinking ? 'thinking' : micEnabled ? 'listening' : 'paused'

  return (
    <div className="ia-stage" ref={stageRef}>
      <div className="ia-glass ia-bar ia-bar--toolbar">
        <Toolbar
          session={session}
          onEnd={session.stop}
          onToggleCollapse={toggleCollapsed}
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
            onSubmit={submitTyped}
            onCancelTyping={() => setTyping(false)}
            onClear={() => useSessionStore.getState().clearTranscript()}
            onExpand={() => setTyping((v) => !v)}
          />

          <div className="ia-glass ia-bar ia-bar--card">
            {/* The pager and Clear belong to the ANSWER. In chat mode they would
                page turns you cannot see and clear an answer you are not looking
                at, so the head swaps to the chat's own clear. */}
            <AnswerCardHead
              onClear={() => chatMode
                ? useSessionStore.getState().clearChat()
                : useSessionStore.getState().clearAnswer()}
              canClear={chatMode ? chatCount > 0 : !!question}
              // Same key in both modes — it clears whatever the card is showing.
              // ⌘⇧⌫ is the transcript bar's, which stays visible in chat mode,
              // so reusing it here would give one chord two meanings on screen.
              clearCombo="mod del"
              clearTitle={chatMode ? 'Clear the chat' : 'Clear the answer'}
              onExpand={() => setDrawerOpen((v) => !v)}
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
              : <AnswerPanel />}
          </div>
        </>
      )}
    </div>
  )
}
