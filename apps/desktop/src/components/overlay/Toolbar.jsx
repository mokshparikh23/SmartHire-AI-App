import React, { useEffect, useRef, useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { useSettingsStore } from '../../store/settingsStore'
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
// PREMIUM-UX 2026-08-31: `endArming` added. SessionPanel owns the two-step
// state so the ⌘⇧X chord and this pill cannot get out of step with each other.
// export default function Toolbar({ session, onEnd, onToggleCollapse }) {
// PREMIUM-UX 2026-08-31: onHelp opens the shortcut sheet from the ⋮ menu, for
// anyone who never discovers that `?` does it.
export default function Toolbar({
  session, onEnd, endArming, onToggleCollapse, onHelp,
}) {
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
  // ANSWER-STYLE 2026-08-30: the pill says what comes back, not what is sent.
  const followups        = useSettingsStore((s) => s.answerMode === 'followups')

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
            // PLACEMENT 2026-09-01: ⌥ was hard-coded, so this tooltip told a
            // Windows user to hold a key their keyboard does not have. comboLabel
            // spells it Alt there. Same fix as Dashboard.jsx's ⌘⇧H title.
            // : `… ⌥click for …`
            : `${systemSource ? 'System audio' : 'Microphone'} ${micEnabled ? 'on' : 'off'} · ${comboLabel('alt')}click for ${systemSource ? 'microphone' : 'system audio'}`
        }
      >
        <Icon name={systemSource ? 'speaker' : 'mic'} size={15} />
      </button>

      {/* ── Actions ── */}
      {/* ANSWER-STYLE 2026-08-30: the button fires the same request in both
          modes — it is the word for what comes back that changes. */}
      {/* PREMIUM-UX 2026-08-31 ─ the same slot stops what it started ───────────
          There was no way to stop a runaway answer at all: the only "stop" in
          the UI was ⌘⇧X, which ends the whole billed interview. And this pill
          was DISABLED while thinking — so at the exact moment the user most
          wants to act, the most prominent button in the toolbar went dead.

          It swaps in place rather than appearing beside: same slot, same width
          class, no layout shift at the moment the panel is busiest. */}
      {/* <button className="ia-pill" onClick={session.regenerate} disabled={isThinking || !hasQuestion}> */}
      {isThinking ? (
        <button
          className="ia-pill ia-pill--stop"
          onClick={() => (chatMode ? session.stopChat?.() : session.stopGenerating?.())}
          title={`Stop generating (${comboLabel('mod .')})`}
        >
          Stop <Kbd combo="mod ." />
        </button>
      ) : (
        <button
          className="ia-pill"
          onClick={session.regenerate}
          disabled={!hasQuestion}
          // title={hasQuestion ? `Answer again (${comboLabel('mod enter')})` : 'No question yet'}
          title={hasQuestion
            ? `${followups ? 'Suggest' : 'Answer'} again (${comboLabel('mod enter')})`
            : 'No question yet'}
        >
          {/* Answer <Kbd combo="mod enter" /> */}
          {followups ? 'Suggest' : 'Answer'} <Kbd combo="mod enter" />
        </button>
      )}

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

      {/* TOOLBAR-FIT 2026-09-01: --chat so the narrowest container query can hide
          this one specifically. ⌘⇧J still opens it — see the note in overlay.css. */}
      {/* <button className="ia-pill" data-active={chatMode} …> */}
      <button
        className="ia-pill ia-pill--chat"
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

      {/* PREMIUM-UX 2026-08-31: the meter, on a metered product ────────────────
          Elapsed time and credits remaining were two clicks deep in the ⋮ menu,
          on a product billed by the minute. They belong where they can be
          glanced at, and the balance turns amber before it becomes a problem
          rather than after. */}
      <SessionMeter />

      <OverflowMenu session={session} onHelp={onHelp} />

      {/* BUGFIX 2026-08-30: onClick={onEnd} handed React's SyntheticEvent to
          stop(), whose first parameter is the END REASON — and preload passes
          that straight to ipcRenderer.invoke(). A SyntheticEvent is not
          structured-cloneable (own function props, a DOM target, a fiber on
          _targetInst), so the call threw and /api/session/stop was never sent.
          The row stayed open until the next Start superseded it or the sweep
          called it stale, which is why the Sessions page almost never said
          "Ended by you". */}
      {/* PREMIUM-UX 2026-08-31: two-step, and it finally carries its chord.
          Ending the session is irreversible and metered, and ⌘⇧X appeared in no
          tooltip or chip anywhere in the app — so the only way to discover it
          was to end an interview by accident. */}
      {/* <button className="ia-pill ia-pill--danger" onClick={onEnd} title="End session"> */}
      {/* <button className="ia-pill ia-pill--danger" onClick={() => onEnd()} title="End session">End</button> */}
      <button
        className="ia-pill ia-pill--danger"
        data-arming={!!endArming}
        onClick={() => onEnd()}
        title={endArming
          ? 'Press again to end the session'
          : `End session (${comboLabel('mod shift x')})`}
      >
        {endArming ? 'Press again' : <>End <Kbd combo="mod shift x" /></>}
      </button>
    </div>
  )
}

/**
 * The ⋮ menu. Holds what the reference's toolbar has no room for and what does
 * not need to be one click away: the timer, the credit balance, and Retry/Copy,
 * which the old footer carried before the feedback row took its place.
 */
/* PREMIUM-UX 2026-08-31 ─ elapsed and balance, in the toolbar ─────────────────
   Subscribes to three values that change at most once a second and once a
   heartbeat, never per token — so this re-renders on its own and never drags
   the rest of the toolbar with it.

   The amber threshold is the point. A balance that only tells you it is gone
   when it is gone is not a meter; five minutes is enough to finish a thought and
   decide whether to top up. */
const LOW_MINUTES = 5

function SessionMeter() {
  const elapsed          = useSessionStore((s) => s.elapsed)
  const unlimited        = useSessionStore((s) => s.unlimited)
  const minutesRemaining = useSessionStore((s) => s.minutesRemaining)

  const mm = Math.floor(elapsed / 60).toString().padStart(2, '0')
  const ss = (elapsed % 60).toString().padStart(2, '0')
  const low = !unlimited && minutesRemaining != null && minutesRemaining <= LOW_MINUTES

  return (
    <span className="ia-meter" data-low={low} title={unlimited
      ? 'Elapsed · unlimited plan'
      : `Elapsed · ${minutesRemaining ?? '—'} minutes of credit left`}>
      <span className="ia-meter-time">{mm}:{ss}</span>
      {!unlimited && minutesRemaining != null && (
        <span className="ia-meter-left">{minutesRemaining}m</span>
      )}
    </span>
  )
}

// PREMIUM-UX 2026-08-31: onHelp added. The timer and balance also moved out to
// SessionMeter above and are kept here too, since the menu has room to spell
// them out.
// function OverflowMenu({ session }) {
// function OverflowMenu({ session }) {
function OverflowMenu({ session, onHelp }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const elapsed          = useSessionStore((s) => s.elapsed)
  const unlimited        = useSessionStore((s) => s.unlimited)
  const minutesRemaining = useSessionStore((s) => s.minutesRemaining)
  const isThinking       = useSessionStore((s) => s.isThinking)
  const hasQuestion      = useSessionStore((s) => !!s.currentQuestion)
  // ANSWER-STYLE 2026-08-30: same reason as the pill above — Retry and Copy act
  // on whatever the card is holding, and in the default mode that is a
  // suggestion rather than an answer.
  const followups        = useSettingsStore((s) => s.answerMode === 'followups')

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
            {/* <span>Retry answer</span> */}
            <Icon name="reset" size={13} />
            <span>{followups ? 'Retry suggestion' : 'Retry answer'}</span>
            <Kbd combo="mod shift r" />
          </button>
          <button onClick={copyAnswer}>
            {/* <span>Copy answer</span> */}
            <Icon name="copy" size={13} />
            <span>{followups ? 'Copy suggestion' : 'Copy answer'}</span>
            <Kbd combo="mod shift c" />
          </button>
          <button onClick={() => { window.electronAPI?.toggleOverlay?.(); setOpen(false) }}>
            <Icon name="eyeOff" size={13} /><span>Hide window</span>
            <Kbd combo="mod shift h" />
          </button>
          {/* PREMIUM-UX 2026-08-31: the way in for anyone who never finds `?`. */}
          <button onClick={() => { onHelp?.(); setOpen(false) }}>
            <Icon name="keyboard" size={13} /><span>Keyboard shortcuts</span>
            <Kbd combo="?" />
          </button>
        </div>
      )}
    </span>
  )
}
