'use client'

import { Card, Button, Field, CONTROL } from 'smarthire-ui'
// import Icon from 'smarthire-ui/Icon'   // BACK-ARROW 2026-09-01: the arrow moved to PageHeader
import CompanyCombobox from './CompanyCombobox'
import RoleCombobox from './RoleCombobox'   // ROLE-SUGGEST 2026-09-01
import ResumePanel from './ResumePanel'

/*
  RESUME-UPLOAD 2026-08-30

  Was ProfileForm, local to InterviewProfiles.jsx. Renamed on the way out rather
  than moved as-is: components/dashboard/ProfileForm.jsx already exists and is
  the account-settings name form, and two files with one name in one tree is how
  the wrong import gets written.
*/
/* ANSWER-STYLE 2026-08-30: the picker's vocabulary, in one place.

   The keys are the CHECK constraint's values in
   supabase/migrations/20260830040000_answer_style.sql; the labels are what the
   interviewer reads. Never render the key — 'desi' is a fine token for a
   database column and a poor thing to put on a form. */
const ANSWER_STYLES = [
  ['plain', 'Standard'],
  ['desi',  'Indian English'],
]

export default function InterviewForm({ value, onChange, onSave, onCancel, busy, error, ensureProfileId }) {
  const set = (k, v) => onChange({ ...value, [k]: v })

  const style = value.answer_style === 'desi' ? 'desi' : 'plain'

  /* Roving tabIndex, lifted from the resume view switcher in ResumePanel.jsx —
     with the one thing that pattern is missing, because here it is not optional.
     Only the selected button is in the tab order, which is correct; on its own
     that also means the OTHER option cannot be reached by keyboard at all. A tab
     strip gets away with that, just about, since a tab reveals a panel you could
     scroll to anyway. This is the value itself, so without arrow keys the
     setting is mouse-only. Selection follows focus, as in a native radio group. */
  const onStyleKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const i    = ANSWER_STYLES.findIndex(([k]) => k === style)
    const step = e.key === 'ArrowRight' ? 1 : ANSWER_STYLES.length - 1
    const next = ANSWER_STYLES[(i + step) % ANSWER_STYLES.length][0]
    set('answer_style', next)
    e.currentTarget.querySelector(`#answer-style-${next}`)?.focus()
  }

  return (
    <Card>
      {/* BACK-ARROW 2026-09-01

          The card's own title and back arrow are BOTH gone from here. They moved
          up to the page heading in InterviewProfiles.jsx, where the arrow sits
          beside a <h1> that now reads "Edit interview" instead of "Interviews".

          Leaving the h2 in place would have printed the same three words twice,
          about 40px apart, which is what a heading duplicated across two levels
          always looks like. The card is the only thing on the screen, so the
          page heading is its heading.

          Cancel at the bottom stays — same destination, different moment: the
          arrow is for "I am at the top and I am done looking", Cancel is for
          "I have read to the bottom and I am not saving".

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Back to interviews"
          className="-ml-1.5 shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-canvas-2 hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <h2 className="text-[15px] font-semibold text-ink">
          {value.id ? 'Edit interview' : 'New interview'}
        </h2>
      </div>
      */}

      {/* mb-5, not mt-4: with the heading gone this is the first thing in the
          card, and the space it needs is underneath it. */}
      {error && <p className="mb-5 text-[13px] text-critical">{error}</p>}

      {/* COMPANY-FIRST 2026-09-01

          Was: interview name, role, company. Now: company, role, name.

          The name is the one field here that is OPTIONAL and DERIVED — leave it
          blank and deriveInterviewName() builds it out of the company and the
          role. Asking for it first asked for the conclusion before the two
          facts it is drawn from, and the autofocus put the cursor there, so the
          form opened by inviting you to hand-write a name the next two fields
          were about to write for you.

          It also matches the desktop wizard, whose first step is called
          "Company & Role" (apps/desktop/src/pages/InterviewSetup.jsx). Two
          screens for the same interview, asked in two different orders, is a
          difference the reader has to notice and then discard. */}
      {/* mt-6 dropped with the h2 it was spacing away from. The card's own p-6
          is the top gap now. */}
      {/* <div className="mt-6 grid gap-5 sm:grid-cols-2"> */}
      <div className="grid gap-5 sm:grid-cols-2">
        {/* htmlFor, not a wrapping label: the combobox has its own click targets
            inside, and a <label> would forward an option click to the input. */}
        <Field label="Company" htmlFor="interview-company">
          <CompanyCombobox
            id="interview-company"
            name={value.company}
            domain={value.company_domain}
            autoFocus
            onChange={({ name, domain }) =>
              onChange({ ...value, company: name, company_domain: domain })}
          />
        </Field>
        {/* ROLE-SUGGEST 2026-09-01: was a bare <input>. Same htmlFor reasoning as
            the company field above — the combobox has click targets inside it,
            and Field's default <label> wrapper would forward an option click
            straight to the input, closing the list without picking anything. */}
        {/* <Field label="Role">
          <input className={CONTROL} value={value.role}
            onChange={(e) => set('role', e.target.value)} placeholder="SDE2" />
        </Field> */}
        <Field label="Role" htmlFor="interview-role">
          <RoleCombobox
            id="interview-role"
            value={value.role}
            onChange={(role) => set('role', role)}
          />
        </Field>
        {/* CONCEPT 2026-08-30: was "Candidate name", placeholder "Priya Sharma".
            The reader is the candidate, so what this field is actually for is
            telling one interview from another in the desktop picker. The column
            is still `candidate_name` — see the note in InterviewProfiles.jsx. */}
        {/* CANDIDATE-FIRST 2026-09-01: not `required` any more. deriveInterviewName()
            in lib/resume.js names it from the company and role — or the date —
            when this is left blank, so the asterisk was promising a wall that no
            longer exists. */}
        {/* <Field label="Interview name" required hint="So you can pick the right one in the app."> */}
        <Field label="Interview name" hint="Optional — named from the company and role if you leave it blank.">
          {/* autoFocus moved to the company field above with COMPANY-FIRST. */}
          {/* <input className={CONTROL} value={value.candidate_name} autoFocus */}
          <input className={CONTROL} value={value.candidate_name}
            onChange={(e) => set('candidate_name', e.target.value)} placeholder="Google · round 2" />
        </Field>
      </div>

      <ResumePanel value={value} onChange={onChange} ensureProfileId={ensureProfileId} />

      <div className="mt-6">
        {/* hint was "Optional. Cited as [JD] in follow-ups." */}
        {/* hint dropped 2026-09-01 — the placeholder already says it is a paste
            box, and "[JD]" named a citation marker the answers do not show. */}
        {/* <Field label="Job description" hint="Optional. Cited as [JD] in answers."> */}
        <Field label="Job description">
          <textarea
            className={`${CONTROL} h-28 resize-y py-3 leading-relaxed`}
            value={value.job_description}
            onChange={(e) => set('job_description', e.target.value)}
            placeholder="Paste the job description you are interviewing against…"
          />
        </Field>
      </div>

      {/* ANSWER-STYLE 2026-08-30

          Placed after the job description rather than beside it: the resume and
          the JD are both WHAT the copilot draws on and belong together; this is
          HOW it words the result, and reads as the last decision before Save.

          The control is the segmented switcher from ResumePanel.jsx — same pill,
          same classes, same roving tabIndex — with role="radiogroup" /
          role="radio" / aria-checked in place of tablist / tab / aria-selected.
          That swap is not a style preference. These buttons choose a stored
          value and there is no panel for aria-controls to point at, so calling
          them tabs would announce "tab 2 of 2, selected" for something that is
          actually a setting, and a screen reader user would go looking for the
          content the tab is supposed to have revealed.

          Field's htmlFor points at the CURRENTLY SELECTED button, which is what
          makes wrapping this in a Field safe at all. Field's default wrapper is
          a <label>, and a <label> around its own click targets forwards those
          clicks to the labelled control — the trap the company combobox hit at
          the top of the form. Passing htmlFor switches the wrapper to a plain <div>;
          pointing it at the selected option means clicking the words "Answer
          style" re-selects the value that is already selected, which is a no-op
          by construction rather than by luck. */}
      <div className="mt-6">
        <Field
          label="Answer style"
          htmlFor={`answer-style-${style}`}
          // hint ended "It changes the wording, not what is suggested."
          /* HINT 2026-09-01: was four sentences wrapping to two full-width lines
             under a two-option toggle — four times longer than any other hint in
             this form, and most of it spent defining "Standard" and "Indian
             English", which the two labels already say. What is left is the part
             the labels do not: who the second one is for, and the reassurance
             that it is a register and not a different answer. */
          // hint="The register the copilot writes in. Standard is formal written English. Indian English is plain and direct — short everyday words, shorter sentences — for an interview that is being conducted that way. It changes the wording, not the answer."
          hint="Plain and direct, for an interview being conducted that way. Changes the wording, not the answer."
        >
          <div
            role="radiogroup"
            aria-label="Answer style"
            onKeyDown={onStyleKey}
            className="inline-flex items-center gap-0.5 rounded-full border border-line bg-paper p-1"
          >
            {ANSWER_STYLES.map(([key, label]) => {
              const on = style === key
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  id={`answer-style-${key}`}
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => set('answer_style', key)}
                  className={[
                    'rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors duration-150',
                    on ? 'bg-ink text-paper' : 'text-muted hover:text-ink',
                  ].join(' ')}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </Field>
      </div>

      <div className="mt-8 flex items-center gap-3">
        <Button onClick={onSave} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </Card>
  )
}
