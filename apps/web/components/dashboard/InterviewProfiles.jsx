'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, Button, Badge, EmptyState, PageHeader } from 'smarthire-ui'
import Icon from 'smarthire-ui/Icon'
// ONE-RESUME-CHIP 2026-09-01: RESUME_BUCKET, to mint the signed URL the chip
// opens. Same bucket constant OriginalPdf uses, from the same module.
// import { BLANK_ROW, hydrate, toRow } from '@/lib/resume'
import { BLANK_ROW, RESUME_BUCKET, hydrate, toRow } from '@/lib/resume'
import { logoUrl } from '@/lib/company'
import InterviewForm from './interview/InterviewForm'
import CompanyLogo from './interview/CompanyLogo'

/*
  SETUP-TO-WEB 2026-08-30

  Replaces the desktop's three-step InterviewSetup wizard. Same fields, plus a
  name per row so one account can hold several interviews at once.

  Writes go straight to Supabase as the signed-in user — the migration grants
  insert/update/delete on this table specifically, unlike the billing tables,
  because nothing here is an entitlement someone could grant themselves.

  RESUME-UPLOAD 2026-08-30: with one exception. resume_file_path was taken out of
  that grant, so the columns describing a stored PDF are written only by
  /api/resume/parse on the service role. toRow() therefore never sends them, and
  ensureProfileId() below exists so that route always has a row to write to.
*/

// RESUME-UPLOAD 2026-08-30: the blank row moved to lib/resume.js, where hydrate()
// and toRow() can share one definition of the shape.
// const BLANK = {
//   candidate_name: '', company: '', role: '',
//   resume: '', resume_consent: false, job_description: '',
// }

/* BACK-ARROW 2026-09-01: the page heading, in the three states this screen has.

   It used to be one fixed <PageHeader title="Interviews"> in page.jsx, printed
   above whichever of the two views was showing. That was wrong once the form
   opened: the page still announced "Interviews" while you were plainly inside
   one, and the only way out was the Cancel button below the fold.

   The ledes are not decoration either — each one says what the screen in front
   of you is for, so the heading block is doing work in all three states rather
   than repeating the sidebar. */
const HEADINGS = {
  // lede was "Set up a candidate here once. The desktop app just picks one and starts."
  list: {
    title: 'Interviews',
    lede: 'Set an interview up here once. The desktop app just picks one and starts.',
  },
  edit: {
    title: 'Edit interview',
    lede: 'What the copilot knows before the call — the company, the role, your resume and the job description.',
  },
  create: {
    title: 'New interview',
    lede: 'Only the company and the role are worth filling in now. The rest can wait.',
  },
}

/*
  PREMIUM-LIST 2026-09-01 ─ "Added 3 Sep", formatted identically on both sides.

  A FIXED locale and an EXPLICIT UTC zone, not `toLocaleDateString()` with the
  browser's defaults. This is a client component, so Next renders it once on the
  server and hydrates it in the browser — and Node's locale and the server's time
  zone are not the reader's. Any disagreement between those two passes is a
  hydration mismatch, which React settles by throwing away the server HTML for
  the whole subtree. Both passes run this one formatter, so both emit the same
  characters. `deriveInterviewName()` in lib/resume.js may use the reader's own
  locale precisely because it only ever runs on a click, never during render.

  Built once at module scope: constructing an Intl.DateTimeFormat is the
  expensive half of formatting a date, and this list re-renders on every hover
  and every delete confirmation.
*/
/* 'en-US' rather than 'en-GB', which renders September as "Sept" — four letters
   where every other month gets three, so the column jitters once a year. It also
   puts the month first, matching deriveInterviewName()'s "Interview — Sep 1,
   02:44 AM", which is the name printed on the very rows this sits under. */
// const ADDED_FMT = new Intl.DateTimeFormat('en-GB', { … })
const ADDED_FMT = new Intl.DateTimeFormat('en-US', {
  day: 'numeric', month: 'short', timeZone: 'UTC',
})

function addedOn(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : ADDED_FMT.format(d)
}

export default function InterviewProfiles({ initialProfiles, userId }) {
  const [profiles, setProfiles] = useState(initialProfiles)
  const [editing, setEditing]   = useState(null)   // row being edited, or BLANK_ROW for new
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState(null)
  /* PREMIUM-LIST 2026-09-01: the id of the row whose bin has been pressed once.
     Deleting an interview takes its resume, its parsed record and its stored PDF
     with it, and until now one click on a 15px icon did all of that with no way
     back — no undo, no confirm, and the row gone before the pointer moved. */
  const [confirming, setConfirming] = useState(null)
  /* ONE-RESUME-CHIP 2026-09-01: the id of the row whose signed URL is in flight.
     Minting one is a round trip to Supabase, and without this the chip is a
     button that looks unchanged while it works — two impatient clicks then open
     two tabs. */
  const [opening, setOpening] = useState(null)

  const supabase = createClient()

  /**
   * Open an interview's stored PDF in a new tab.
   *
   * ONE-RESUME-CHIP 2026-09-01. The URL is minted HERE, in the browser, with the
   * anon key — the bucket's one permissive policy (select, own folder) is what
   * that is for, and it saves a route. Sixty seconds, because a signed URL is a
   * bearer token: it should outlive the click that produced it and nothing more.
   * Both facts are OriginalPdf's, which does the same thing for the form's
   * viewer; lib/storage.js `signResume()` is the server-side twin.
   *
   * THE TAB IS OPENED BEFORE THE AWAIT, and navigated afterwards. A
   * window.open() that runs after an await has lost the user gesture that
   * justified it, and Chrome and Safari both block it as a popup — the click
   * would appear to do nothing at all. Opening it empty first keeps the gesture,
   * and gives the reader a tab that is visibly loading while the URL is minted.
   */
  const openResume = async (p) => {
    const tab = window.open('', '_blank')
    // Nulled while the tab is still about:blank and therefore same-origin. The
    // destination is our own storage URL, but a handle back to this page is not
    // something the PDF viewer needs.
    if (tab) tab.opener = null

    setOpening(p.id)
    setError(null)

    try {
      const { data, error: err } = await supabase
        .storage.from(RESUME_BUCKET)
        .createSignedUrl(p.resume_file_path, 60)

      if (err || !data?.signedUrl) throw new Error(err?.message || 'Could not open that PDF.')

      if (tab) tab.location = data.signedUrl
      // A blocked popup is the one failure with nothing on screen to explain it:
      // the click did work, and the tab it asked for was refused by the browser.
      else setError('Your browser blocked the new tab. Allow pop-ups for this site, or open the interview and use the Original PDF tab.')
    } catch (e) {
      tab?.close()
      setError(e.message)
    } finally {
      setOpening(null)
    }
  }

  const merge = (row) =>
    setProfiles(prev => prev.some(p => p.id === row.id)
      ? prev.map(p => (p.id === row.id ? row : p))
      : [row, ...prev])

  /*
    CONCEPT 2026-08-30: `candidate_name` is now the NAME OF THE INTERVIEW, not
    the name of a person. The reader of the app is the candidate, so a field
    holding somebody else's name has nobody to hold — what one account needs
    instead is a label per interview ("Google · SDE2 · round 2") to pick from in
    the desktop app.

    The COLUMN keeps its name on purpose. Renaming it means a migration, a change
    in /api/profiles, and a matching change in the desktop's profile picker, all
    to rename a string that is already doing the right job. The label, the
    placeholder and the messages below are what the user reads, and those are
    what changed. If the column is ever renamed, this comment is the map.
  */
  const save = async () => {
    const form = editing
    /* CANDIDATE-FIRST 2026-09-01: the name is no longer a wall. toRow() derives
       one from the company and role — or the date — when the field is blank, so
       an interview with nothing typed into it is a legal placeholder rather than
       a save that gets refused. */
    // if (!form.candidate_name.trim()) return setError('Candidate name is required.')
    // if (!form.candidate_name.trim()) return setError('Give this interview a name.')

    setBusy(true)
    setError(null)

    const row = toRow(form)

    const query = form.id
      ? supabase.from('interview_profiles').update(row).eq('id', form.id).select().single()
      : supabase.from('interview_profiles').insert({ ...row, user_id: userId }).select().single()

    const { data, error: err } = await query
    setBusy(false)

    if (err) return setError(err.message)

    merge(data)
    setEditing(null)
  }

  /**
   * The interview's id, creating the row first if it does not have one yet.
   *
   * A resume dropped on a never-saved interview has nothing to attach to: the
   * parse route writes resume_file_path, which the browser is not granted, so
   * the file cannot be recorded client-side afterwards either. Saving the row at
   * the moment of the drop is the honest resolution — the user has just handed
   * us their own CV, so an interview existing for it is expected, and it is
   * visible in the list rather than held in limbo.
   *
   * CANDIDATE-FIRST 2026-09-01: THROWS rather than returning null. The old
   * contract — "return null and surface the reason" — had exactly one caller,
   * ResumePanel, whose response to a null was `setPhase('idle'); return`. That is
   * a silent abort: the user drops a PDF, the dropzone snaps back to empty, and
   * the reason is printed by a different component well above it. With the name
   * check gone there is no legitimate null left, so the remaining failure is a
   * database error, and the panel's own catch is the right place to report it —
   * right under the drop target the user is looking at.
   */
  const ensureProfileId = async () => {
    if (editing?.id) return editing.id

    /* The wall this function used to be. See save() above: the name is derived
       now, so a resume dropped on an unnamed interview creates the row and
       attaches, instead of failing with nothing on screen.
    if (!editing.candidate_name.trim()) {
      // setError('Add the candidate’s name before attaching a resume.')
      setError('Name this interview before attaching a resume.')
      return null
    }
    */

    const { data, error: err } = await supabase
      .from('interview_profiles')
      .insert({ ...toRow(editing), user_id: userId })
      .select()
      .single()

    // if (err) { setError(err.message); return null }
    if (err) throw new Error(err.message)

    setEditing(prev => ({ ...prev, id: data.id }))
    merge(data)
    return data.id
  }

  const remove = async (id) => {
    setBusy(true)
    // The stored PDF is not orphaned by this: an after-delete trigger records
    // the object path in storage_orphans, and the next parse or sweep removes
    // the bytes. That holds for this direct client delete too, which is why the
    // delete grant could stay.
    const { error: err } = await supabase.from('interview_profiles').delete().eq('id', id)
    setBusy(false)
    /* PREMIUM-LIST 2026-09-01: the confirmation closes either way. On success the
       row it belonged to is gone; on failure the reason is now in the error card
       at the top of the page, and leaving a live "Delete" button sitting under a
       message about why the last one did not work invites a second try that
       fails the same way. */
    setConfirming(null)
    if (err) return setError(err.message)
    setProfiles(prev => prev.filter(p => p.id !== id))
  }

  const close = () => { setEditing(null); setError(null) }

  if (editing) {
    const heading = editing.id ? HEADINGS.edit : HEADINGS.create
    return (
      <div>
        {/* backLabel names the DESTINATION, not the gesture. A screen reader
            saying "Back" leaves you to guess back to what, and this form
            replaces the list rather than sitting over it. */}
        <PageHeader
          title={heading.title}
          lede={heading.lede}
          onBack={close}
          backLabel="Back to interviews"
        />
        <InterviewForm
          value={editing}
          onChange={setEditing}
          onSave={save}
          onCancel={close}
          busy={busy}
          error={error}
          ensureProfileId={ensureProfileId}
        />
      </div>
    )
  }

  // BUGFIX 2026-08-30: was setEditing(p) / setEditing({ ...BLANK }). save() writes
  // null for every empty column, so the raw row fed `value.resume.trim()` a null
  // during ProfileForm's render — editing an interview saved without a resume
  // threw a TypeError and took the page with it.
  // PREMIUM-LIST 2026-09-01: both also close any half-pressed delete. Opening a
  // form and coming back to find a row still armed is a confirmation the user
  // has long since stopped thinking about.
  // const startNew  = () => { setEditing(hydrate(BLANK_ROW)); setError(null) }
  // const startEdit = (p) => { setEditing(hydrate(p)); setError(null) }
  const startNew  = () => { setEditing(hydrate(BLANK_ROW)); setError(null); setConfirming(null) }
  const startEdit = (p) => { setEditing(hydrate(p)); setError(null); setConfirming(null) }

  const count = profiles.length

  return (
    <div>
      {/* No onBack: this IS the top of the section. */}
      {/* PREMIUM-LIST 2026-09-01 ─ the primary action moved INTO the header.

          It used to be a pill alone on its own row between the lede and the
          list: a 44px band of nothing, with its only content pushed to the far
          right corner. That band was the first thing the eye crossed on the way
          down the page, and it said nothing. PageHeader already reserves a
          right-hand slot on the title line for exactly this.

          Withheld while the list is empty. The empty state below carries the
          same button, in the middle of the screen where there is nothing else to
          look at, and two identical buttons 150px apart is not a choice — it is
          a question about which one is the real one.

          <div className="mb-5 flex justify-end">
            <Button icon="plus" onClick={startNew}>New interview</Button>
          </div> */}
      <PageHeader
        title={HEADINGS.list.title}
        lede={HEADINGS.list.lede}
        action={count > 0 ? <Button icon="plus" onClick={startNew}>New interview</Button> : null}
      />

      {/* The message used to sit on its own with nothing to mark it as a
          failure but the colour, which is the one channel some readers do not
          have. */}
      {error && (
        <Card className="mb-5 flex items-start gap-2.5 border-critical/30 bg-critical-soft">
          <Icon name="warning" size={16} className="mt-px shrink-0 text-critical" />
          <p className="text-[13px] leading-relaxed text-critical">{error}</p>
        </Card>
      )}

      {count === 0 ? (
        <Card padded={false}>
          <EmptyState
            // A person, on a screen where a row is an interview and the only
            // person involved is the reader. Line comments, not a braced JSX
            // comment: between attributes the parser is reading JavaScript, and
            // a braced comment there is a spread it cannot make sense of.
            // icon="users"
            icon="building"
            title="No interviews set up"
            // description="Add a candidate here, then pick them in the desktop app when the interview starts."
            description="Add an interview here, then pick it in the desktop app when the call starts."
            action={<Button icon="plus" onClick={startNew}>New interview</Button>}
          />
        </Card>
      ) : (
        /*
          PREMIUM-LIST 2026-09-01 ─ ONE PANEL, NOT A STACK OF CARDS.

          What was here: `<div className="space-y-3">` wrapping one full `<Card>`
          per interview — a rounded, bordered, 24px-padded box each, floating on
          the page with 12px of white between them. Two interviews therefore read
          as two unrelated objects that happen to be near each other, and the eye
          had to re-find the left edge, the name and the buttons in every one.
          The badges sat mid-row with nothing aligning them, so the loudest thing
          on the screen was a green Resume pill.

          Now: one panel, a header strip, and hairline-divided rows. The borders
          that were drawn 2n times are drawn once, every row shares its column
          edges with its neighbours, and the colour comes out of the chips —
          which is what lets the interview NAME be the loudest thing in its row.

          The old markup is NOT reproduced verbatim in this comment, and cannot
          be: it carried its own block comments, whose terminators would end this
          one halfway through. Its four explanatory notes are the ones that still
          describe live code — CONCEPT, OWN-CV, ANSWER-STYLE, RESUME-UPLOAD — and
          each is carried into the markup below rather than left in a dead copy.
          `git show HEAD:apps/web/components/dashboard/InterviewProfiles.jsx` is
          the verbatim record.
        */
        <Card padded={false} className="overflow-hidden">
          {/* The panel's own header. It earns its height twice over: the count
              is the one fact about the LIST rather than about any row in it, and
              the strip gives the first row a top edge to start under instead of
              butting into the card's rounded corner. */}
          <div className="flex items-center justify-between gap-4 border-b border-line bg-canvas px-5 py-3">
            <span className="eyebrow">{count} {count === 1 ? 'interview' : 'interviews'}</span>
            {/* True by construction, not a hopeful label: the query in page.jsx
                orders created_at desc, and merge() unshifts a newly created row
                onto the front rather than appending it. */}
            <span className="text-[12px] text-faint">Newest first</span>
          </div>

          <ul className="divide-y divide-line-soft">
            {profiles.map(p => {
              const where  = [p.role, p.company].filter(Boolean).join(' · ')
              const added  = addedOn(p.created_at)
              const arming = confirming === p.id

              return (
                <li key={p.id} className="group relative">
                  {/*
                    THE WHOLE ROW OPENS THE INTERVIEW.

                    An absolutely-positioned button underneath the content — the
                    standard "stretched link". The content layer is
                    pointer-events-none, so a click anywhere in the row falls
                    through to this, and the two real controls switch pointer
                    events back on for themselves.

                    aria-hidden and tabIndex={-1} deliberately. This is a MOUSE
                    convenience duplicating the Edit button a few hundred pixels
                    to its right; exposing it as well would put two controls that
                    do the same thing in the tab order of every row and read the
                    interview's name out twice. It is never focusable, so hiding
                    it breaks no keyboard path — Edit and Delete are both real,
                    labelled buttons.

                    Not rendered at all while the delete confirmation is up: a
                    stray click would otherwise navigate away from a question the
                    user has been asked and not yet answered.
                  */}
                  {!arming && (
                    <button
                      type="button"
                      aria-hidden="true"
                      tabIndex={-1}
                      onClick={() => startEdit(p)}
                      className="absolute inset-0 cursor-pointer"
                    />
                  )}

                  {/* The two backgrounds are chosen in JS rather than stacked as
                      `bg-critical-soft group-hover:bg-canvas`. Both write the
                      same property, and hovering an armed row would then repaint
                      it as an ordinary one — Tailwind v4 settles collisions by
                      stylesheet order, and a hover variant wins over a base
                      utility regardless of the order you wrote them. Exactly one
                      of the two ever reaches the class list. */}
                  <div className={[
                    'pointer-events-none relative flex items-center gap-4 px-5 py-4',
                    'transition-colors duration-150',
                    // canvas-2, not canvas. The whole row is a click target and
                    // canvas (#faf9f7) against paper is a difference you have to
                    // be told about to see; an affordance nobody notices is not
                    // one. It is also the strip above's colour, so a hovered row
                    // and the panel header would have matched.
                    arming ? 'bg-critical-soft' : 'group-hover:bg-canvas-2',
                  ].join(' ')}>
                    {/* Always a 44px slot, never conditional, so every row's text
                        starts on the same left edge. Was 36px: the rows are
                        taller now, and the mark is the one thing on this screen
                        with a colour of its own, so it can carry it.

                        logoUrl() answers null without a domain and CompanyLogo
                        falls back to the company's initial — so a company typed
                        without picking a suggestion still gets a mark of its own
                        rather than the generic building glyph, which is now only
                        for a row with no company at all. */}
                    {p.company_domain || p.company
                      ? <CompanyLogo src={logoUrl(p.company_domain, 96)} name={p.company} size={44} />
                      : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line-soft bg-canvas-2 text-faint">
                          <Icon name="building" size={19} />
                        </span>}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-ink">{p.candidate_name}</p>
                      <p className="mt-1 truncate text-[13px] text-muted">
                        {where || <span className="text-faint">No role or company set</span>}
                        {/* The date is the quietest thing in the row, and the
                            reason the second line is worth having at all on an
                            interview whose derived name already reads
                            "SDE · Capgemini" — without it, that line is the
                            title printed twice. */}
                        {added && <span className="text-faint"> · Added {added}</span>}
                      </p>
                    </div>

                    {/* Hidden below md rather than wrapped. A chip row that drops
                        under the name makes that one row taller than its
                        neighbours, and a list whose rows differ in height for
                        reasons the reader cannot see is exactly what this panel
                        was rebuilt to stop.

                        Hidden outright while the row is armed, so the question
                        and its two answers get the width. What is attached to an
                        interview is not what you are being asked about, and on a
                        narrow window the chips would push Delete and Keep off
                        the row entirely. */}
                    <div className={arming
                      ? 'hidden'
                      : 'hidden shrink-0 items-center gap-1.5 md:flex'}>
                      {/* CONCEPT 2026-08-30: the badge read "consented / not
                          consented" — the interviewer confirming someone else's
                          permission. The document is the reader's own now, so
                          the flag means "in the prompt or not", which is what
                          the badge says. The column and the gate are untouched.
                          {p.resume_consent ? 'Resume · consented' : 'Resume · not consented'} */}
                      {/* OWN-CV 2026-09-01: "not in use" was a state the user
                          could reach without meaning to and could not see the
                          cost of. With the tick gone there are two states — a
                          resume or none — so the badge says which, and the tone
                          stops carrying a warning about a choice nobody makes
                          any more.
                      {p.resume
                        ? <Badge tone={p.resume_consent ? 'positive' : 'warning'}>
                            {p.resume_consent ? 'Resume · in use' : 'Resume · not in use'}
                          </Badge>
                        : <Badge>No resume</Badge>} */}
                      {/* PREMIUM-LIST 2026-09-01: the green goes. `positive` is
                          a STATUS tone — it means something went right — and
                          having a resume attached is a fact about the interview,
                          not an outcome. It was also the most saturated thing on
                          the page, on every row, which is how the eye ended up
                          reaching the chips before the name. The palette note in
                          packages/ui/src/styles/base.css is explicit that colour
                          here is for links and small marks; neutral chips put
                          the emphasis back on the ink.

                          The absence stays plain text on purpose. A chip is a
                          thing you have; "No resume" is a thing you do not, and
                          giving it the same pill made an empty interview look as
                          furnished as a complete one.
                      {p.resume
                        ? <Badge tone="positive">Resume</Badge>
                        : <Badge>No resume</Badge>} */}
                      {/* ONE-RESUME-CHIP 2026-09-01 ─ ONE CHIP, AND IT OPENS.

                          There were two: "Resume" for the parsed text and "PDF"
                          for the stored file. That is a distinction from inside
                          the database — a row with both has one resume, not two,
                          and printing the same fact twice is what made the chip
                          group read as wider than the interview it describes.

                          So the file becomes the chip's BEHAVIOUR instead of a
                          second chip. Three states, one slot:

                            a stored PDF   → a chip you can click, which opens it
                            text only      → the same chip, inert
                            neither        → plain text, not a pill

                          The middle state stays a plain Badge rather than a
                          disabled button on purpose: a resume typed or pasted
                          into the form has no file to open, and a control that
                          is dead on arrival invites the click it cannot answer.
                          Nothing is lost by it — the row still opens the
                          interview, where the text is.

                          The chip is `pointer-events-auto` for the same reason
                          Edit and the bin are: the content layer above the
                          stretched link is pointer-events-none, so without it
                          the click falls through to "open the interview".

                      {p.resume
                        ? <Badge><Icon name="file" size={11} />Resume</Badge>
                        : <span className="text-[12px] text-faint">No resume</span>}
                      {p.resume_file_path && <Badge>PDF</Badge>} */}
                      {p.resume_file_path ? (
                        <Badge
                          as="button"
                          type="button"
                          interactive
                          className="pointer-events-auto"
                          onClick={() => openResume(p)}
                          disabled={opening === p.id}
                          /* Names the interview, not just the action: "Open the
                             resume PDF", read out on five rows in a row, says
                             which one no better than "Edit" did. */
                          aria-label={`Open the resume PDF for ${p.candidate_name}`}
                        >
                          <Icon name="file" size={11} />
                          {opening === p.id ? 'Opening…' : 'Resume'}
                        </Badge>
                      ) : p.resume ? (
                        <Badge><Icon name="file" size={11} />Resume</Badge>
                      ) : (
                        <span className="text-[12px] text-faint">No resume</span>
                      )}
                      {p.job_description && <Badge>JD</Badge>}
                      {/* ANSWER-STYLE 2026-08-30: only the non-default is worth
                          a badge. A row reading "Standard" on every candidate is
                          noise; a row reading "Indian English" on one of five is
                          the fact you wanted to check before starting.

                          Default `neutral` tone and no className. Recolouring a
                          Badge through className puts two same-property
                          utilities on one element and Tailwind v4 picks the
                          winner by stylesheet order rather than by the order you
                          wrote them — add a tone to TONES in
                          packages/ui/src/index.jsx if a colour is ever wanted. */}
                      {/* <Badge>Indian English</Badge> — an icon, now that the
                          chips beside it carry one and a bare word would read as
                          the odd one out. */}
                      {p.answer_style === 'desi' && <Badge><Icon name="globe" size={11} />Indian English</Badge>}
                    </div>

                    <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
                      {arming ? (
                        <>
                          {/* The question is asked in the row itself rather than
                              in a dialog over the page: what is about to be
                              destroyed is right there, named, and does not have
                              to be described a second time in a modal. */}
                          <span className="hidden pr-1 text-[13px] font-medium text-ink sm:inline">
                            Delete this?
                          </span>
                          {/* SMALLER-ROW-ACTIONS 2026-09-01: xs, like every
                              other control in this row — the confirmation
                              replaces Edit and the bin in place, and two
                              buttons that arrive taller than the pair they
                              stand in for make the row jump on a click that was
                              only meant to ask a question.
                          <Button size="sm" variant="danger" onClick={() => remove(p.id)} disabled={busy}> */}
                          <Button size="xs" variant="danger" onClick={() => remove(p.id)} disabled={busy}>
                            {busy ? 'Deleting…' : 'Delete'}
                          </Button>
                          {/* "Keep", not "Cancel". Cancel sitting next to Delete
                              is ambiguous about which of the two it cancels. */}
                          {/* <Button size="sm" variant="ghost" onClick={() => setConfirming(null)} disabled={busy}> */}
                          <Button size="xs" variant="ghost" onClick={() => setConfirming(null)} disabled={busy}>
                            Keep
                          </Button>
                        </>
                      ) : (
                        <>
                          {/* aria-label rather than the bare word: "Edit",
                              announced on its own five times down a list, names
                              nothing. */}
                          {/* SMALLER-ROW-ACTIONS 2026-09-01: xs (32px), not sm.

                              At 36px the pill was taller than the interview's
                              own name is tall, on every row, five rows down —
                              so the loudest object in the list became a button
                              that does exactly what clicking the row already
                              does. The row is the action here; Edit is the
                              visible handle for it, and a handle should be
                              smaller than the thing it opens.
                          <Button size="sm" variant="secondary" onClick={() => startEdit(p)}
                            aria-label={`Edit ${p.candidate_name}`}> */}
                          <Button size="xs" variant="secondary" onClick={() => startEdit(p)}
                            aria-label={`Edit ${p.candidate_name}`}>
                            Edit
                          </Button>
                          {/* RESUME-UPLOAD 2026-08-30: a bin, not a ✕. This
                              deletes the interview and now queues its stored PDF
                              for deletion too; ✕ reads as "dismiss this row". */}
                          {/* <Icon name="close" size={14} /> */}
                          {/* PREMIUM-LIST 2026-09-01: two changes on one button.

                              It no longer deletes — it arms the confirmation
                              above, because the click it used to take destroyed
                              the interview, its resume, its parsed record and
                              its stored PDF with no undo and no question.

                              And `quiet` is a VARIANT, not `variant="ghost"
                              className="text-faint hover:text-critical"`. That
                              would put two `color` utilities on one element, and
                              Tailwind v4 resolves same-property collisions by
                              stylesheet order rather than by the order of your
                              class attribute — the trap documented at
                              BUTTON_VARIANTS in packages/ui/src/index.jsx.
                          <Button size="sm" variant="ghost" onClick={() => remove(p.id)} disabled={busy}
                            aria-label={`Delete ${p.candidate_name}`}> */}
                          {/* SMALLER-ROW-ACTIONS 2026-09-01: `iconOnly`, and xs.

                              It was a 36×43px PILL holding a 15px glyph — side
                              padding sized for a word that is not there, which
                              is why the bin sat off-centre in its own hover
                              tint. iconOnly gives it the square (so, with
                              rounded-full, the circle) that a wordless button
                              wants, and the red hover fill now lands as a disc
                              centred on the glyph instead of a stretched
                              lozenge beside it.
                          <Button size="sm" variant="quiet" onClick={() => setConfirming(p.id)}
                            disabled={busy} aria-label={`Delete ${p.candidate_name}`}>
                            <Icon name="trash" size={15} /> */}
                          {/* ROW-CHIP-PARITY 2026-09-01: 16px in a 24px circle.

                              It went 15 → 14 → 13 as the button shrank, on the
                              theory that the glyph should keep its ring — and
                              at 13 the bin had become the faintest thing in the
                              row, a mark you had to look for to find. The
                              BUTTON is what got smaller here; the icon inside it
                              is the only part the eye actually reads, so it goes
                              the other way. 16 in 24 leaves a 4px ring, which is
                              enough for the hover disc to read as a disc.
                            <Icon name="trash" size={14} />
                            <Icon name="trash" size={13} /> */}
                          <Button size="xs" variant="quiet" iconOnly onClick={() => setConfirming(p.id)}
                            disabled={busy} aria-label={`Delete ${p.candidate_name}`}>
                            <Icon name="trash" size={16} />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
