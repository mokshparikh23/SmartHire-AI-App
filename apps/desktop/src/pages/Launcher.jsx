import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { CHAT_MODELS } from '../services/aiRouter'
import Icon from '../components/ui/Icon'
import Kbd from '../components/overlay/Kbd'
// PREMIUM-UX 2026-08-31: so a server-side session kill can explain itself here,
// after the panel that raised it is gone.
import Notices from '../components/overlay/Notices'
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
 *
 * ANSWER-STYLE 2026-08-30: the answer style travels with the rest of a
 * candidate's context. It is created on the web alongside the company, role and
 * résumé — but unlike those it is a preference rather than a fact, so it is
 * seeded into the store when a candidate is PICKED and the ⋮ menu can override
 * it. See the seed effect below for the precedence rule.
 */

/*
  ANSWER-STYLE 2026-08-30: hoisted out of the Model row's JSX, where it was
  inline. There are three selects in this menu now, and three copies of the same
  eight declarations are three chances to drift — which in a 208px menu shows up
  as rows that do not line up with each other. Nothing about the values changed.

  MENU_OPTION is the same story: a dark <option> on a dark menu is invisible on
  Windows, where the popup is drawn by the OS in its own colours.
*/
const MENU_SELECT = {
  background: 'rgba(255,255,255,.08)', color: '#fff', fontFamily: 'inherit',
  border: 'none', borderRadius: 6, padding: '3px 5px', fontSize: 11, fontWeight: 600,
}
const MENU_OPTION = { color: '#000' }

export default function Launcher({ session, licenseData, onLogout }) {
  const setInterviewContext = useSettingsStore((s) => s.setInterviewContext)
  const interviewContext    = useSettingsStore((s) => s.interviewContext)
  const setAnswerStyle      = useSettingsStore((s) => s.setAnswerStyle)

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

  /*
    ANSWER-STYLE 2026-08-30 ─ the per-candidate default, and what beats it.

    PRECEDENCE. Picking a candidate sets the style from that candidate's profile.
    The ⋮ menu then overrides it, and the override holds for as long as that
    candidate stays picked — through Start, through the session, through a
    Refresh. Picking any candidate again, including re-picking this one after a
    detour through another, re-seeds from the dashboard and drops the override.

    Keyed on the selected id and guarded by a ref rather than on the `profiles`
    array, which gets a fresh identity on every Refresh — without the guard,
    pressing Refresh would silently undo a choice made in the menu ten seconds
    earlier. The cost is that a style edited on the web arrives on the next pick
    or the next launch rather than on Refresh, which is the right trade: the job
    of Refresh is the list.

    WHY THIS IS NOT IN start(). start() below copies five profile fields into
    interviewContext, and this looks like a sixth. It is not, and putting it
    there is the bug this effect exists to avoid: the sequence a user actually
    performs is open ⋮, switch to Desi Mode, press Start — and a copy inside
    start() would discard that choice a moment after they made it, with the menu
    still showing the value it had just thrown away. Seeding on SELECTION means
    the menu always shows what the next session will use.

    setAnswerStyle normalises, so a profile from a server that predates the
    answer_style column arrives as undefined and lands on 'plain'. There is no
    null branch here on purpose.
  */
  const seededForRef = useRef(null)

  useEffect(() => {
    if (!selected || seededForRef.current === selected) return
    const profile = profiles.find((p) => p.id === selected)
    if (!profile) return
    seededForRef.current = selected
    setAnswerStyle(profile.answerStyle)
  }, [selected, profiles, setAnswerStyle])

  const start = async () => {
    const profile = profiles.find((p) => p.id === selected)
    if (!profile) return

    // Copy the chosen profile into the store buildSystemPrompt() reads. The
    // résumé and its consent flag travel together — a résumé without its flag
    // would be treated as unconsented, which is the safe direction but not the
    // right one.
    //
    // ANSWER-STYLE 2026-08-30: answerStyle is NOT copied here, and its absence
    // is deliberate. It is a preference the ⋮ menu can override, seeded when the
    // candidate is picked — see the effect above. Adding it to this object would
    // make Start discard an override made seconds earlier.
    /* CONTEXT 2026-08-31: candidateName, companyDomain and resumeBrief added.
       candidateName was already fetched and already rendered in the list above —
       it just never made it into the store the prompt reads, so the model never
       knew whose interview it was sitting in. companyDomain and resumeBrief are
       newly returned by /api/profiles.

       This call is also what makes the tightened partialize in settingsStore
       safe: every résumé field is rewritten here from a freshly fetched row on
       every start, so nothing depends on the persisted copy. */
    // setInterviewContext({
    //   company: profile.company, role: profile.role, resume: profile.resume,
    //   resumeConsent: profile.resumeConsent, jobDescription: profile.jobDescription,
    // })
    setInterviewContext({
      company:        profile.company,
      companyDomain:  profile.companyDomain || '',
      role:           profile.role,
      candidateName:  profile.candidateName || '',
      resume:         profile.resume,
      resumeBrief:    profile.resumeBrief || '',
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
        {/* PREMIUM-UX 2026-08-31: when the SERVER ends a session — credits gone,
            request limit, licence revoked — the panel is torn down and this
            screen comes back. It had no idea why, so a paid interview simply
            vanished. Notices live in sessionStore and stopSession does not clear
            them, so the explanation pushed as the session died is still here. */}
        <Notices />

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
 *
 * ANSWER-STYLE 2026-08-30: and the two axes of what the copilot produces — what
 * it is for (answerMode) and how it words the result (answerStyle). Note that
 * MainApp unmounts Launcher while a session runs, so both are chosen before
 * Start and neither is changeable mid-session. That is acceptable today; if it
 * ever needs to change, the home is Toolbar.jsx's OverflowMenu, and no service
 * change would be needed because buildSystemPrompt() reads the store at call
 * time rather than at session start.
 */
function LauncherMenu({ onLogout, onOpenWeb }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const model             = useSettingsStore((s) => s.model)
  const setModel          = useSettingsStore((s) => s.setModel)
  const overlayOpacity    = useSettingsStore((s) => s.overlayOpacity)
  const setOverlayOpacity = useSettingsStore((s) => s.setOverlayOpacity)

  // ANSWER-STYLE 2026-08-30: read here the same way model and opacity are.
  // setAnswerStyle is also written by the profile seed in Launcher above, and
  // last write wins between them — which is the precedence rule, documented at
  // the seed rather than repeated here.
  const answerMode        = useSettingsStore((s) => s.answerMode)
  const setAnswerMode     = useSettingsStore((s) => s.setAnswerMode)
  const answerStyle       = useSettingsStore((s) => s.answerStyle)
  const setAnswerStyle    = useSettingsStore((s) => s.setAnswerStyle)

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
          {/* ANSWER-STYLE 2026-08-30: above Model on purpose. This menu is read
              top down, and what the copilot DOES is a bigger question than which
              model does it — the Model row answers "how well", these two answer
              "what for" and "in what words". The labels match the store keys, so
              a bug report quoting the UI greps straight to settingsStore.js and
              on to buildSystemPrompt(). */}
          <div className="ia-menu-row" style={{ height: 'auto', padding: '8px 9px' }}>
            <Icon name="bulb" size={13} />
            <span style={{ flex: 1 }}>Answer mode</span>
            <select
              value={answerMode}
              onChange={(e) => setAnswerMode(e.target.value)}
              style={MENU_SELECT}
            >
              <option value="followups" style={MENU_OPTION}>Suggest follow-ups</option>
              <option value="answer"    style={MENU_OPTION}>Answer the question</option>
            </select>
          </div>

          <div className="ia-menu-row" style={{ height: 'auto', padding: '8px 9px' }}>
            <Icon name="pen" size={13} />
            <span style={{ flex: 1 }}>Answer style</span>
            <select
              value={answerStyle}
              onChange={(e) => setAnswerStyle(e.target.value)}
              style={MENU_SELECT}
            >
              <option value="plain" style={MENU_OPTION}>Standard</option>
              <option value="desi"  style={MENU_OPTION}>Desi Mode</option>
            </select>
          </div>

          {/* Says the one thing a user could reasonably get wrong about this
              control, in the place they would get it wrong. The product it will
              be compared to writes a candidate's answers for them; this writes
              the interviewer's follow-ups in shorter words. Same shape as the
              "no AI provider configured" row below — an explanatory row under
              the control it explains, shown only when it applies. */}
          {answerStyle === 'desi' && (
            <div
              className="ia-menu-row"
              style={{ height: 'auto', padding: '0 9px 8px 31px', color: 'rgba(255,255,255,.38)' }}
            >
              <span style={{ flex: 1, fontWeight: 500, lineHeight: 1.35 }}>
                Plain Indian English. Changes the wording, not what is suggested.
              </span>
            </div>
          )}

          <div className="ia-menu-row" style={{ height: 'auto', padding: '8px 9px' }}>
            <Icon name="robot" size={13} />
            <span style={{ flex: 1 }}>
              Model
              {catalog?.providerLabel && (
                <span style={{ opacity: 0.55, fontWeight: 500 }}> · {catalog.providerLabel}</span>
              )}
            </span>
            {/* ANSWER-STYLE 2026-08-30: the inline style object below moved to
                the module-scope MENU_SELECT / MENU_OPTION, unchanged, now that
                three selects share it.
                style={{
                  background: 'rgba(255,255,255,.08)', color: '#fff', fontFamily: 'inherit',
                  border: 'none', borderRadius: 6, padding: '3px 5px', fontSize: 11, fontWeight: 600,
                }} */}
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={MENU_SELECT}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id} style={MENU_OPTION}>{m.label}</option>
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
