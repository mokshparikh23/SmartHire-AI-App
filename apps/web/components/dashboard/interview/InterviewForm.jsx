'use client'

import { Card, Button, Field, CONTROL } from 'smarthire-ui'
import CompanyCombobox from './CompanyCombobox'
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

  /* Roving tabIndex, lifted from the résumé view switcher in ResumePanel.jsx —
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
      <h2 className="text-[15px] font-semibold text-ink">
        {value.id ? 'Edit interview' : 'New interview'}
      </h2>

      {error && <p className="mt-4 text-[13px] text-critical">{error}</p>}

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
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
          <input className={CONTROL} value={value.candidate_name} autoFocus
            onChange={(e) => set('candidate_name', e.target.value)} placeholder="Google · round 2" />
        </Field>
        <Field label="Role">
          <input className={CONTROL} value={value.role}
            onChange={(e) => set('role', e.target.value)} placeholder="SDE2" />
        </Field>
        {/* htmlFor, not a wrapping label: the combobox has its own click targets
            inside, and a <label> would forward an option click to the input. */}
        <Field label="Company" htmlFor="interview-company">
          <CompanyCombobox
            id="interview-company"
            name={value.company}
            domain={value.company_domain}
            onChange={({ name, domain }) =>
              onChange({ ...value, company: name, company_domain: domain })}
          />
        </Field>
      </div>

      <ResumePanel value={value} onChange={onChange} ensureProfileId={ensureProfileId} />

      <div className="mt-6">
        {/* hint was "Optional. Cited as [JD] in follow-ups." */}
        <Field label="Job description" hint="Optional. Cited as [JD] in answers.">
          <textarea
            className={`${CONTROL} h-28 resize-y py-3 leading-relaxed`}
            value={value.job_description}
            onChange={(e) => set('job_description', e.target.value)}
            placeholder="Paste the job description you are interviewing against…"
          />
        </Field>
      </div>

      {/* ANSWER-STYLE 2026-08-30

          Placed after the job description rather than beside it: the résumé and
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
          clicks to the labelled control — the trap the company combobox hit
          three fields up. Passing htmlFor switches the wrapper to a plain <div>;
          pointing it at the selected option means clicking the words "Answer
          style" re-selects the value that is already selected, which is a no-op
          by construction rather than by luck. */}
      <div className="mt-6">
        <Field
          label="Answer style"
          htmlFor={`answer-style-${style}`}
          // hint ended "It changes the wording, not what is suggested."
          hint="The register the copilot writes in. Standard is formal written English. Indian English is plain and direct — short everyday words, shorter sentences — for an interview that is being conducted that way. It changes the wording, not the answer."
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
