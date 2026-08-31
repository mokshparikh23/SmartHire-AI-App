import React, { useEffect } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import Icon from '../ui/Icon'

/* PREMIUM-UX 2026-08-31 ─────────────────────────────────────────────────────────
   The error surface that the next question cannot wipe.

   Every failure in this app used to render as a red box INSIDE the answer body.
   Two consequences, both bad: it sat in the space an answer should be, and
   sessionStore's setQuestion clears `error` — so "the microphone could not be
   opened" vanished without trace the moment anyone spoke. When capture is dead,
   something being said is exactly the event that erased the message saying so.

   WHERE IT SITS. Its own bar, ABOVE the toolbar, flex-shrink: 0. It never steals
   height from the answer and never covers a control. That placement is why it is
   a bar rather than a floating toast: a toast over a 720px always-on-top panel
   during a live call would cover the thing the user is reading.

   AUTO-DISMISS, except when it must not. A transient failure clears itself after
   a few seconds. A sticky one — dead capture, out of credits — needs the
   condition to resolve or the user to dismiss it, because it describes something
   that is still true.

   The action is an { label, href } rather than a callback, so a notice stays
   plain data. That is what lets one raised as a session dies survive
   stopSession() and be rendered by the launcher afterwards.
*/

const AUTO_DISMISS_MS = 8000

function Notice({ notice }) {
  const dismiss = useSessionStore((s) => s.dismissNotice)

  useEffect(() => {
    if (notice.sticky) return
    const id = setTimeout(() => dismiss(notice.id), AUTO_DISMISS_MS)
    return () => clearTimeout(id)
  }, [notice.id, notice.sticky, dismiss])

  const open = () => {
    if (!notice.action?.href) return
    window.electronAPI?.getWebUrl?.().then((url) => {
      if (url) window.electronAPI?.openExternal?.(`${url}${notice.action.href}`)
    })
  }

  return (
    <div className="ia-notice" data-kind={notice.kind}>
      <Icon name={notice.kind === 'info' ? 'bolt' : 'warning'} size={14} />
      <span className="ia-notice-text">{notice.text}</span>
      {notice.action && (
        <button className="ia-pill" onClick={open}>{notice.action.label}</button>
      )}
      <button
        className="ia-btn ia-btn--ghost"
        onClick={() => dismiss(notice.id)}
        title="Dismiss"
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  )
}

export default function Notices() {
  const notices = useSessionStore((s) => s.notices)
  if (!notices.length) return null

  return (
    <div className="ia-notices">
      {notices.map((n) => <Notice key={n.id} notice={n} />)}
    </div>
  )
}
