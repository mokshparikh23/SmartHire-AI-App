import React, { useCallback, useRef, useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { useSettingsStore } from '../../store/settingsStore'
import { usePanelOpacity, usePanelHotkeys } from '../../hooks/useOverlay'
import StatusIndicator from './StatusIndicator'
import TranscriptBar from './TranscriptBar'
import AnswerPanel from './AnswerPanel'
import TurnPager, { TurnDrawer } from './TurnPager'
import Icon from '../ui/Icon'
import '../../styles/overlay.css'

/**
 * The floating dark-glass panel shown while a session is running.
 *
 * The window is sized to this panel by the main process, so everything outside
 * its rounded corners is empty screen — clicks there reach the app behind
 * because our window is not there at all.
 */
export default function SessionPanel({ session }) {
  const panelRef = useRef(null)

  // Narrow subscriptions only. currentAnswer is subscribed inside AnswerPanel,
  // so a streamed token re-renders that leaf and nothing else.
  const question     = useSessionStore((s) => s.currentQuestion)
  const source       = useSessionStore((s) => s.source)
  const isThinking   = useSessionStore((s) => s.isThinking)
  const elapsed      = useSessionStore((s) => s.elapsed)
  const turns        = useSessionStore((s) => s.turns)
  const activeTurnId = useSessionStore((s) => s.activeTurnId)
  const selectTurn   = useSessionStore((s) => s.selectTurn)

  const overlayOpacity = useSettingsStore((s) => s.overlayOpacity)
  usePanelOpacity(panelRef, overlayOpacity)

  const [typing, setTyping]         = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const copy = useCallback((text) => {
    if (text) window.electronAPI?.copyText?.(text)
  }, [])

  const submitTyped = useCallback((text) => {
    setTyping(false)
    session.askManual(text)
  }, [session])

  usePanelHotkeys({
    onType:  () => setTyping(true),
    onStop:  session.stop,
    onRetry: session.regenerate,
    onCopy:  () => copy(useSessionStore.getState().currentAnswer),
  })

  return (
    <div className="ia-stage">
      <div className="ia-panel" ref={panelRef}>
        <div className="ia-header">
          <StatusIndicator
            state={isThinking ? 'thinking' : 'listening'}
            levelRef={session.levelRef}
            elapsed={elapsed}
          />

          <span className="ia-spacer" />

          <TurnPager
            turns={turns}
            activeTurnId={activeTurnId}
            onSelect={selectTurn}
            drawerOpen={drawerOpen}
            onToggleDrawer={() => setDrawerOpen((v) => !v)}
          />

          <button
            className="ia-btn"
            onClick={() => setTyping((v) => !v)}
            title="Type a question (⌘⇧K)"
          >
            <Icon name="keyboard" size={14} />
          </button>
          <button
            className="ia-btn"
            onClick={() => window.electronAPI?.toggleOverlay?.()}
            title="Hide (⌘⇧H)"
          >
            <Icon name="eyeOff" size={14} />
          </button>
          <button
            className="ia-btn ia-btn--stop"
            onClick={session.stop}
            title="End session (⌘⇧X)"
          >
            <Icon name="stop" size={13} />
          </button>
        </div>

        {drawerOpen && turns.length > 0 && (
          <TurnDrawer
            turns={turns}
            activeTurnId={activeTurnId}
            onSelect={(id) => { selectTurn(id); setDrawerOpen(false) }}
          />
        )}

        <TranscriptBar
          question={question}
          source={source}
          typing={typing}
          onSubmit={submitTyped}
          onCancelTyping={() => setTyping(false)}
        />

        <AnswerPanel onRegenerate={session.regenerate} onCopy={copy} />
      </div>
    </div>
  )
}
