import React, { useEffect, useRef, useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import Icon from '../ui/Icon'
import Kbd, { comboLabel } from './Kbd'

/**
 * REDESIGN 2026-08-29: the top bar.
 *
 * Replaces the old .ia-header, which was a row of bare icon buttons. Every
 * action is now labelled and carries its shortcut inline, which is the point of
 * the reference design — the panel is used mid-interview, when nobody is going
 * to hover an unlabelled glyph to find out what it does.
 *
 * SUBSCRIPTIONS: booleans only. This must never subscribe to currentAnswer, or
 * every streamed token re-renders the toolbar — see store/sessionStore.js.
 */
export default function Toolbar({ session, onEnd, onToggleCollapse }) {
  const isThinking       = useSessionStore((s) => s.isThinking)
  const hasQuestion      = useSessionStore((s) => !!s.currentQuestion)
  const micEnabled       = useSessionStore((s) => s.micEnabled)
  const screenEnabled    = useSessionStore((s) => s.screenEnabled)
  const screenPermission = useSessionStore((s) => s.screenPermission)
  const chatMode         = useSessionStore((s) => s.chatMode)
  const captureSource    = useSessionStore((s) => s.captureSource)
  const setMicEnabled    = useSessionStore((s) => s.setMicEnabled)
  const setCaptureSource = useSessionStore((s) => s.setCaptureSource)
  const setScreenEnabled = useSessionStore((s) => s.setScreenEnabled)
  const toggleChat       = useSessionStore((s) => s.toggleChat)

  const screenDenied = screenPermission === 'denied' || screenPermission === 'restricted'
  const systemSource = captureSource === 'system'

  return (
    <div className="ia-toolbar">
      {/* ── Capture toggles ── */}
      <button
        className="ia-toggle"
        data-on={screenEnabled && !screenDenied}
        data-denied={screenDenied}
        onClick={() => {
          // The grant is made in System Settings; askForMediaAccess cannot ask
          // for Screen Recording, so a denied toggle opens the pane instead.
          if (screenDenied) { window.electronAPI?.openScreenSettings?.(); return }
          setScreenEnabled(!screenEnabled)
        }}
        title={screenDenied ? 'Screen Recording permission needed — open System Settings'
                            : screenEnabled ? 'Screen capture on' : 'Screen capture off'}
      >
        <Icon name="monitor" size={15} />
      </button>

      {/* SYSTEM-AUDIO 2026-08-30: one toggle, two sources. Click switches the
          capture on and off; alt-click swaps which audio is captured, so the
          common case stays a single click and the rare one needs no new chrome
          in a toolbar that is already full.

          The denied branch mirrors the screen toggle above it: on macOS the
          loopback tap sits behind the SAME Screen Recording grant, so without
          it "on" would mean "on but silently deaf" — exactly the failure this
          whole change exists to remove. */}
      <button
        className="ia-toggle"
        data-on={micEnabled && !(systemSource && screenDenied)}
        data-denied={systemSource && screenDenied}
        onClick={(e) => {
          if (e.altKey) { setCaptureSource(systemSource ? 'mic' : 'system'); return }
          if (systemSource && screenDenied) { window.electronAPI?.openScreenSettings?.(); return }
          setMicEnabled(!micEnabled)
        }}
        title={
          systemSource && screenDenied
            ? 'System audio needs Screen Recording permission — open System Settings'
            : `${systemSource ? 'System audio' : 'Microphone'} ${micEnabled ? 'on' : 'off'} · ⌥click for ${systemSource ? 'microphone' : 'system audio'}`
        }
      >
        <Icon name={systemSource ? 'speaker' : 'mic'} size={15} />
      </button>

      {/* ── Actions ── */}
      <button
        className="ia-pill"
        onClick={session.regenerate}
        disabled={isThinking || !hasQuestion}
        title={hasQuestion
          ? `Answer again (${comboLabel('mod enter')})`
          : 'No question yet'}
      >
        Answer <Kbd combo="mod enter" />
      </button>

      <button
        className="ia-pill"
        onClick={session.askAboutScreen}
        // Gated on the screen toggle, so the capture switch actually switches
        // something off rather than being decoration next to a button that
        // captures anyway.
        disabled={isThinking || !screenEnabled || screenDenied}
        title={screenDenied ? 'Screen Recording permission needed'
             : !screenEnabled ? 'Turn on screen capture first'
             : `Capture the screen and ask about it (${comboLabel('mod shift enter')})`}
      >
        Screenshot <Kbd combo="mod shift enter" />
      </button>

      <button
        className="ia-pill"
        data-active={chatMode}
        onClick={toggleChat}
        title={`Chat (${comboLabel('mod shift j')})`}
      >
        Chat <Kbd combo="mod shift j" />
      </button>

      <span className="ia-spacer" />

      {/* Inherits the bar's drag region rather than setting no-drag — dragging
          is what this control is for. */}
      <span className="ia-btn ia-btn--move ia-btn--ghost" title="Drag to move">
        <Icon name="move" size={14} />
      </span>

      <button
        className="ia-btn ia-btn--ghost"
        onClick={onToggleCollapse}
        title="Collapse"
      >
        <Icon name="collapse" size={14} />
      </button>

      <OverflowMenu session={session} />

      {/* BUGFIX 2026-08-30: onClick={onEnd} handed React's SyntheticEvent to
          stop(), whose first parameter is the END REASON — and preload passes
          that straight to ipcRenderer.invoke(). A SyntheticEvent is not
          structured-cloneable (own function props, a DOM target, a fiber on
          _targetInst), so the call threw and /api/session/stop was never sent.
          The row stayed open until the next Start superseded it or the sweep
          called it stale, which is why the Sessions page almost never said
          "Ended by you". */}
      {/* <button className="ia-pill ia-pill--danger" onClick={onEnd} title="End session"> */}
      <button className="ia-pill ia-pill--danger" onClick={() => onEnd()} title="End session">
        End
      </button>
    </div>
  )
}

/**
 * The ⋮ menu. Holds what the reference's toolbar has no room for and what does
 * not need to be one click away: the timer, the credit balance, and Retry/Copy,
 * which the old footer carried before the feedback row took its place.
 */
function OverflowMenu({ session }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const elapsed          = useSessionStore((s) => s.elapsed)
  const unlimited        = useSessionStore((s) => s.unlimited)
  const minutesRemaining = useSessionStore((s) => s.minutesRemaining)
  const isThinking       = useSessionStore((s) => s.isThinking)
  const hasQuestion      = useSessionStore((s) => !!s.currentQuestion)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const mm = Math.floor(elapsed / 60).toString().padStart(2, '0')
  const ss = (elapsed % 60).toString().padStart(2, '0')

  const copyAnswer = () => {
    // Read at click time — this component deliberately does not subscribe to
    // currentAnswer, so it cannot hold it in a closure.
    const { currentAnswer } = useSessionStore.getState()
    if (currentAnswer) window.electronAPI?.copyText?.(currentAnswer)
    setOpen(false)
  }

  return (
    <span className="ia-menu-wrap" ref={wrapRef}>
      <button
        className="ia-btn ia-btn--ghost"
        onClick={() => setOpen((v) => !v)}
        title="More"
      >
        <Icon name="dots" size={14} />
      </button>

      {open && (
        <div className="ia-menu">
          <div className="ia-menu-row">
            <Icon name="clock" size={13} />
            Elapsed <b>{mm}:{ss}</b>
          </div>
          <div className="ia-menu-row">
            <Icon name="bolt" size={13} />
            {/* metered:false is what an unlimited subscription looks like, so
                the flag decides this — not the size of minutesRemaining. */}
            Remaining <b>{unlimited ? 'Unlimited'
                        : minutesRemaining == null ? '—'
                        : `${minutesRemaining} min`}</b>
          </div>

          <div className="ia-menu-sep" />

          <button onClick={() => { session.regenerate(); setOpen(false) }}
                  disabled={isThinking || !hasQuestion}>
            <Icon name="reset" size={13} /><span>Retry answer</span>
            <Kbd combo="mod shift r" />
          </button>
          <button onClick={copyAnswer}>
            <Icon name="copy" size={13} /><span>Copy answer</span>
            <Kbd combo="mod shift c" />
          </button>
          <button onClick={() => { window.electronAPI?.toggleOverlay?.(); setOpen(false) }}>
            <Icon name="eyeOff" size={13} /><span>Hide window</span>
            <Kbd combo="mod shift h" />
          </button>
        </div>
      )}
    </span>
  )
}
