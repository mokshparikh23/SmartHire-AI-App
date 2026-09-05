import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { CHAT_MODELS } from '../services/aiRouter'
import Icon from '../components/ui/Icon'
// DOCK 2026-09-06: comboLabel so the "no Dock icon" note names the right keys
// on each platform (⌘⇧H on macOS, Ctrl+Shift+H on Windows) instead of lying on one.
import Kbd, { comboLabel } from '../components/overlay/Kbd'
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
 * Nothing is authored here any more. Company, role, resume, JD and the resume
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
 * resume — but unlike those it is a preference rather than a fact, so it is
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
  const setInterviewContext   = useSettingsStore((s) => s.setInterviewContext)
  // QUICK-START 2026-09-01: start() can now run with no profile picked, and
  // setInterviewContext MERGES. Without an explicit clear, a blank start would
  // silently inherit the last interview's company and role from the persisted
  // blob. See the branch in start() below.
  const clearInterviewContext = useSettingsStore((s) => s.clearInterviewContext)
  const interviewContext      = useSettingsStore((s) => s.interviewContext)
  const setAnswerStyle        = useSettingsStore((s) => s.setAnswerStyle)

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

  /* PREMIUM-UX 2026-08-31 ─ the Start button's chip was a lie ─────────────────
     The button has rendered `Start Session ⌘↵` since the redesign, and this
     screen registered exactly one listener: a `mousedown` for closing the ⋮
     menu. Pressing ⌘↵ did nothing at all.

     Implemented rather than removed — the affordance is the right one, and a
     chip that works is better than one less chip. Guarded the same way the
     button is (`selected && !starting`) so the chord and the click cannot
     disagree, and it stays off any focused form control so it does not steal
     Enter from the ⋮ menu's selects. */
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return
      const el = e.target
      if (el instanceof HTMLElement &&
          (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) {
        return
      }
      // QUICK-START 2026-09-01: `selectedRef.current` dropped from this guard.
      // The button below no longer requires a selection either, and the point of
      // the original guard was that the chord and the click must not disagree.
      // if (!selectedRef.current || startingRef.current) return
      if (startingRef.current) return
      e.preventDefault()
      startRef.current?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
  /* Read by the ⌘↵ listener above. Refs rather than dependencies: rebinding a
     window listener every time the list refreshes or the pick changes is churn
     for no gain, and `start` is redefined on every render. */
  const selectedRef = useRef(selected)
  const startingRef = useRef(starting)
  const startRef = useRef(null)
  selectedRef.current = selected
  startingRef.current = starting

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

    /* QUICK-START 2026-09-01 ─ starting with nothing set up.
       `if (!profile) return` used to sit here, and with the footer button also
       requiring a selection it meant a brand-new user — no interviews on the web
       yet — had no working action on this screen at all. The empty state told
       them to go to the dashboard and come back.

       The clear is load-bearing, not tidiness. setInterviewContext MERGES
       (store/settingsStore.js) and interviewContext is persisted, so without it
       a blank start would quietly reuse the previous interview's company and
       role — wrong on screen and wrong in the prompt. The resume fields cannot
       leak this way (partialize blanks them), but company and role can. */
    // Copy the chosen profile into the store buildSystemPrompt() reads. The
    // resume and its consent flag travel together — a resume without its flag
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
       safe: every resume field is rewritten here from a freshly fetched row on
       every start, so nothing depends on the persisted copy. */
    // setInterviewContext({
    //   company: profile.company, role: profile.role, resume: profile.resume,
    //   resumeConsent: profile.resumeConsent, jobDescription: profile.jobDescription,
    // })
    /* OWN-CV 2026-09-01: resumeConsent stops being copied in. buildSystemPrompt()
       no longer reads it (see the note there), and carrying a value nothing
       consumes is how a retired gate comes back to life by accident — the next
       person to add a resume field copies the line above it.

       /api/profiles still RETURNS the field, and that is deliberate: a desktop
       build older than this one does still gate on it, so the column has to keep
       telling the truth even though this build ignores it. */
    if (profile) {
      // setInterviewContext({ …, resumeConsent: profile.resumeConsent, … })
      setInterviewContext({
        company:        profile.company,
        companyDomain:  profile.companyDomain || '',
        role:           profile.role,
        candidateName:  profile.candidateName || '',
        resume:         profile.resume,
        resumeBrief:    profile.resumeBrief || '',
        jobDescription: profile.jobDescription,
      })
    } else {
      clearInterviewContext()
    }

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

  startRef.current = start

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
            {/* QUICK-START 2026-09-01: this said "Add a candidate on the web —
                name, role, resume — then pick them here when the interview
                starts", which is the interviewer's voice in a candidate product,
                and it was a dead end: the only action was to leave. */}
            <strong>Nothing set up yet</strong>
            <span>
              That is fine — you can start now and the copilot works from the
              conversation alone. Add an interview on the web when you want
              company- and CV-aware answers.
            </span>
            <button
              className="ia-pill"
              onClick={() => { if (!starting) start() }}
              disabled={starting}
              style={{ marginTop: 4 }}
            >
              {starting ? 'Starting…' : 'Start without an interview'}
            </button>
            <button className="ia-pill" onClick={() => openWeb()} style={{ marginTop: 4 }}>
              Open the web dashboard
            </button>
            {/* A user upgrading from the wizard has a local setup that would
                otherwise vanish silently. Offer it rather than migrating behind
                their back — the resume is theirs to re-consent to. */}
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
                {/* OWN-CV 2026-09-01: there are two states now, not three. A
                    resume on the interview is a resume in the prompt, so the
                    "No consent" tag described a condition that can no longer
                    happen — and while it could, it was the one that sent people
                    into an interview wondering why nothing cited [resume].
                {p.resume
                  ? <span className={`ia-ltag ${p.resumeConsent ? 'ia-ltag--on' : 'ia-ltag--off'}`}>
                      {p.resumeConsent ? 'Resume' : 'No consent'}
                    </span>
                  : <span className="ia-ltag">No resume</span>} */}
                {p.resume
                  ? <span className="ia-ltag ia-ltag--on">Resume</span>
                  : <span className="ia-ltag">No resume</span>}

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
          // QUICK-START 2026-09-01: was `disabled={!selected || starting}`. With
          // zero interviews that was the dead end — the primary action on the
          // screen was inert and nothing on the screen could make it live.
          // start() handles the no-profile case now.
          disabled={starting}
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
  // CANDIDATE-ONLY 2026-09-01: unread now that the Answer mode row is retired.
  // Left commented rather than deleted so the row above it can come back in one
  // piece if the interviewer copilot is ever revived as its own product.
  // const answerMode        = useSettingsStore((s) => s.answerMode)
  // const setAnswerMode     = useSettingsStore((s) => s.setAnswerMode)
  const answerStyle       = useSettingsStore((s) => s.answerStyle)
  const setAnswerStyle    = useSettingsStore((s) => s.setAnswerStyle)

  /* DOCK 2026-09-06 ─ the one setting that is NOT in settingsStore ────────────
     Every other row here reads zustand, which persists to the renderer's
     localStorage. This one cannot: the main process has to know it at launch,
     before any renderer exists, or the Dock icon appears for a second on every
     start and then vanishes — the exact flash the setting exists to prevent. It
     lives in main's electron-store and is read over IPC into local state, not
     mirrored into zustand, where it would be a second copy free to drift. */
  const [showInDock, setShowInDock] = useState(false)
  useEffect(() => {
    let alive = true
    window.electronAPI?.getDockVisible?.()
      .then((v) => { if (alive) setShowInDock(!!v) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

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
          {/* CANDIDATE-ONLY 2026-09-01: the Answer mode row is retired. This was
              the only way to reach the interviewer copilot, and the product is
              for the person being interviewed. Removing the control is what makes
              "what the copilot is FOR" stop being a question the user is asked;
              Answer style below is still a real choice, so it stays.
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
          */}

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

          {/* DOCK 2026-09-06: next to Overlay opacity because both answer "what
              can other people see", which is a different question from the three
              rows above about what the answer says. Default is Hidden. */}
          <div className="ia-menu-row" style={{ height: 'auto', padding: '8px 9px' }}>
            <Icon name="monitor" size={13} />
            <span style={{ flex: 1 }}>Show in Dock</span>
            <select
              value={showInDock ? 'yes' : 'no'}
              onChange={(e) => {
                const next = e.target.value === 'yes'
                setShowInDock(next)
                window.electronAPI?.setDockVisible?.(next)
              }}
              style={MENU_SELECT}
            >
              <option value="no"  style={MENU_OPTION}>Hidden</option>
              <option value="yes" style={MENU_OPTION}>Visible</option>
            </select>
          </div>

          {/* Same shape as the Desi Mode note above: says the one thing someone
              could get wrong, where they would get it wrong. With no Dock icon
              there is also no menu bar, so the two chords below are the app —
              worth stating before someone hides it and looks for a way back. */}
          {!showInDock && (
            <div
              className="ia-menu-row"
              style={{ height: 'auto', padding: '0 9px 8px 31px', color: 'rgba(255,255,255,.38)' }}
            >
              <span style={{ flex: 1, fontWeight: 500, lineHeight: 1.35 }}>
                No Dock icon and no app-switcher entry. {comboLabel('mod shift h')} hides
                and shows this window; {comboLabel('mod shift q')} quits.
              </span>
            </div>
          )}

          <div className="ia-menu-sep" />

          <button onClick={() => { onOpenWeb('/dashboard/billing'); setOpen(false) }}>
            <Icon name="bolt" size={13} /><span>Credits and billing</span>
          </button>
          <button onClick={() => { setOpen(false); onLogout() }}>
            <Icon name="lock" size={13} /><span>Sign out</span>
          </button>

          {/* DOCK 2026-09-06: behind its own separator, last, because it is the
              only irreversible row in this menu — and, with the Dock icon and
              menu bar both gone, one of only two quit affordances left. The
              confirmation lives in main's confirmQuit(), so there is no second
              one here. */}
          <div className="ia-menu-sep" />
          <button onClick={() => { setOpen(false); window.electronAPI?.quitApp?.() }}>
            <Icon name="power" size={13} /><span>Quit Smart Hire AI</span>
            <Kbd combo="mod shift q" />
          </button>
        </div>
      )}
    </span>
  )
}
