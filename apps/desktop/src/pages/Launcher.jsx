import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { CHAT_MODELS } from '../services/aiRouter'
import Icon from '../components/ui/Icon'
import Kbd from '../components/overlay/Kbd'
import '../styles/overlay.css'   // pulls in glass.css, and the shared .ia-btn / .ia-menu

/**
 * SETUP-TO-WEB 2026-08-30
 *
 * The whole desktop app between activation and the overlay: pick an interview,
 * press Start. It replaces Dashboard.jsx (a 27KB green two-pane review screen)
 * and InterviewSetup.jsx (a three-step wizard), both retired.
 *
 * Nothing is authored here any more. Company, role, résumé, JD and the résumé
 * consent flag are created on the web and arrive as a list; picking a row copies
 * it into `interviewContext`, which is where buildSystemPrompt() already reads
 * from — so the consent gate keeps working untouched.
 *
 * The list is fetched through the main process (`profiles:list`): the licence
 * key stays in electron-store, and a main-process request is subject to neither
 * CORS nor the renderer's CSP.
 */
export default function Launcher({ session, licenseData, onLogout }) {
  const setInterviewContext = useSettingsStore((s) => s.setInterviewContext)
  const interviewContext    = useSettingsStore((s) => s.interviewContext)

  const [profiles, setProfiles] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [starting, setStarting] = useState(false)
  const [webUrl, setWebUrl]     = useState('')

  useEffect(() => {
    window.electronAPI?.getWebUrl?.().then(setWebUrl).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await window.electronAPI?.listProfiles?.()
    setLoading(false)

    if (!result?.ok) {
      setError(result?.reason || 'Could not load your interviews.')
      return
    }
    setProfiles(result.profiles)
    // Keep the current pick across a refresh if it still exists.
    setSelected((prev) =>
      result.profiles.some((p) => p.id === prev) ? prev : result.profiles[0]?.id ?? null)
  }, [])

  useEffect(() => { load() }, [load])

  const start = async () => {
    const profile = profiles.find((p) => p.id === selected)
    if (!profile) return

    // Copy the chosen profile into the store buildSystemPrompt() reads. The
    // résumé and its consent flag travel together — a résumé without its flag
    // would be treated as unconsented, which is the safe direction but not the
    // right one.
    setInterviewContext({
      company:        profile.company,
      role:           profile.role,
      resume:         profile.resume,
      resumeConsent:  profile.resumeConsent,
      jobDescription: profile.jobDescription,
    })

    setStarting(true)
    setError(null)
    const result = await session.start()
    setStarting(false)

    if (!result?.ok) {
      setError(
        result?.code === 'out_of_credits'
          ? 'You have run out of credits. Top up to start a session.'
          : result?.reason || 'Could not start the session.'
      )
    }
  }

  const openWeb = (path = '/dashboard/interviews') => {
    if (webUrl) window.electronAPI?.openExternal?.(`${webUrl}${path}`)
  }

  return (
    <div className="ia-glass ia-launcher">
      <div className="ia-lhead">
        <span className="ia-dot ia-dot--live" />
        <span className="ia-ltitle">Smart Hire AI</span>
        <span className="ia-lsub">{licenseData?.email || 'Licensed'}</span>
        <span className="ia-spacer" />
        <LauncherMenu onLogout={onLogout} onOpenWeb={openWeb} />
      </div>

      <div className="ia-lbody">
        <div className="ia-lsection">
          <h2>Interview</h2>
          <span className="ia-spacer" />
          <button className="ia-llink" onClick={load} disabled={loading}>
            <Icon name="reset" size={11} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {/* A load failure and "you have not created any yet" are different
            things, and showing both at once — as this did — tells the user to
            go add a candidate when the list simply could not be fetched. */}
        {error ? (
          <div className="ia-lempty">
            <p className="ia-error" style={{ width: '100%', textAlign: 'left' }}>{error}</p>
            <button className="ia-pill" onClick={load} disabled={loading} style={{ marginTop: 4 }}>
              {loading ? 'Retrying…' : 'Try again'}
            </button>
          </div>
        ) : loading && profiles.length === 0 ? (
          <div className="ia-lempty"><span className="ia-dots"><i /><i /><i /></span></div>
        ) : profiles.length === 0 ? (
          <div className="ia-lempty">
            <Icon name="inbox" size={22} strokeWidth={1.4} />
            <strong>No interviews set up</strong>
            <span>
              Add a candidate on the web — name, role, résumé — then pick them here
              when the interview starts.
            </span>
            <button className="ia-pill" onClick={() => openWeb()} style={{ marginTop: 4 }}>
              Open the web dashboard
            </button>
            {/* A user upgrading from the wizard has a local setup that would
                otherwise vanish silently. Offer it rather than migrating behind
                their back — the résumé is theirs to re-consent to. */}
            {interviewContext?.isSetup && (
              <span style={{ marginTop: 10, fontSize: 11, maxWidth: 300 }}>
                Your previous local setup ({interviewContext.role || 'no role'}
                {interviewContext.company ? ` at ${interviewContext.company}` : ''}) is still
                on this machine. Re-create it on the web to keep using it.
              </span>
            )}
          </div>
        ) : (
          <div className="ia-llist">
            {profiles.map((p) => (
              <button
                key={p.id}
                className="ia-lrow"
                data-selected={p.id === selected}
                onClick={() => setSelected(p.id)}
                // BUGFIX 2026-08-30: the footer button is disabled while
                // `starting`, but this is a different element and consulted
                // nothing — so a quick double-click opened two sessions and
                // session_start() superseded the first, filling the Sessions
                // page with "Started elsewhere" from one machine. main holds the
                // authoritative guard; this just avoids the pointless round trip.
                // onDoubleClick={start}
                onDoubleClick={() => { if (!starting) start() }}
              >
                <div className="ia-lrow-main">
                  <div className="ia-lrow-name">{p.candidateName}</div>
                  <div className="ia-lrow-meta">
                    {[p.role, p.company].filter(Boolean).join(' · ') || 'No role or company'}
                  </div>
                </div>

                {/* The consent state is worth seeing BEFORE starting, not
                    inferred later from whether follow-ups cite [resume]. */}
                {p.resume
                  ? <span className={`ia-ltag ${p.resumeConsent ? 'ia-ltag--on' : 'ia-ltag--off'}`}>
                      {p.resumeConsent ? 'Résumé' : 'No consent'}
                    </span>
                  : <span className="ia-ltag">No résumé</span>}

                {p.id === selected && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ia-lfoot">
        <button className="ia-llink" onClick={() => openWeb()}>
          Manage on the web <Icon name="arrowRight" size={11} />
        </button>
        <span className="ia-spacer" />
        <button
          className="ia-lstart"
          onClick={start}
          disabled={!selected || starting}
          style={{ flex: 'none', minWidth: 190 }}
        >
          {starting ? 'Starting…' : <>Start Session <Kbd combo="mod enter" /></>}
        </button>
      </div>
    </div>
  )
}

/**
 * The ⋮ menu. Holds what Settings.jsx used to be a whole screen for: the model
 * and the overlay opacity, plus sign out.
 */
function LauncherMenu({ onLogout, onOpenWeb }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const model             = useSettingsStore((s) => s.model)
  const setModel          = useSettingsStore((s) => s.setModel)
  const overlayOpacity    = useSettingsStore((s) => s.overlayOpacity)
  const setOverlayOpacity = useSettingsStore((s) => s.setOverlayOpacity)

  // GEMINI-FALLBACK 2026-08-30: the list is the server's, not ours — which
  // provider is live depends on the key the server holds, so CHAT_MODELS here
  // would offer GPT names on a Gemini backend that resolveModel() then silently
  // rewrites. Falls back to the static list only if the call fails.
  const [catalog, setCatalog] = useState(null)

  useEffect(() => {
    let cancelled = false
    window.electronAPI?.listModels?.().then((r) => {
      if (cancelled || !r?.ok) return
      setCatalog(r)
      // A model persisted from a previous provider is meaningless now. Snap to
      // the server's default so the picker and the server agree.
      if (r.configured && !r.models.some((m) => m.id === useSettingsStore.getState().model)) {
        setModel(r.defaultModel)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [setModel])

  const models = catalog?.configured ? catalog.models : CHAT_MODELS

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <span className="ia-menu-wrap" ref={wrapRef}>
      <button className="ia-btn ia-btn--ghost" onClick={() => setOpen((v) => !v)} title="More">
        <Icon name="dots" size={14} />
      </button>

      {open && (
        <div className="ia-menu">
          <div className="ia-menu-row" style={{ height: 'auto', padding: '8px 9px' }}>
            <Icon name="robot" size={13} />
            <span style={{ flex: 1 }}>
              Model
              {catalog?.providerLabel && (
                <span style={{ opacity: 0.55, fontWeight: 500 }}> · {catalog.providerLabel}</span>
              )}
            </span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={{
                background: 'rgba(255,255,255,.08)', color: '#fff', fontFamily: 'inherit',
                border: 'none', borderRadius: 6, padding: '3px 5px', fontSize: 11, fontWeight: 600,
              }}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id} style={{ color: '#000' }}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* The server having no key at all is a different problem from a
              failed request, and it is the operator's to fix — say so rather
              than letting every answer fail with a raw 500. */}
          {catalog && !catalog.configured && (
            <div className="ia-menu-row" style={{ height: 'auto', padding: '4px 9px 8px', color: '#fcd34d' }}>
              <Icon name="warning" size={13} />
              <span style={{ flex: 1, fontWeight: 500 }}>
                No AI provider configured on the server.
              </span>
            </div>
          )}

          <div className="ia-menu-row" style={{ height: 'auto', padding: '8px 9px' }}>
            <Icon name="eyeOff" size={13} />
            <span style={{ flex: 1 }}>Overlay opacity</span>
            <input
              type="range" min="55" max="95" value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(Number(e.target.value))}
              style={{ width: 78, accentColor: '#fff' }}
            />
          </div>

          <div className="ia-menu-sep" />

          <button onClick={() => { onOpenWeb('/dashboard/billing'); setOpen(false) }}>
            <Icon name="bolt" size={13} /><span>Credits and billing</span>
          </button>
          <button onClick={() => { setOpen(false); onLogout() }}>
            <Icon name="lock" size={13} /><span>Sign out</span>
          </button>
        </div>
      )}
    </span>
  )
}
