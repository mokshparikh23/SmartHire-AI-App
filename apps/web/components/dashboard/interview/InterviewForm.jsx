'use client'

import { Card, Button, Field, CONTROL } from '@/components/ui'
import CompanyCombobox from './CompanyCombobox'
import ResumePanel from './ResumePanel'

/*
  RESUME-UPLOAD 2026-08-30

  Was ProfileForm, local to InterviewProfiles.jsx. Renamed on the way out rather
  than moved as-is: components/dashboard/ProfileForm.jsx already exists and is
  the account-settings name form, and two files with one name in one tree is how
  the wrong import gets written.
*/
export default function InterviewForm({ value, onChange, onSave, onCancel, busy, error, ensureProfileId }) {
  const set = (k, v) => onChange({ ...value, [k]: v })

  return (
    <Card>
      <h2 className="text-[15px] font-semibold text-ink">
        {value.id ? 'Edit interview' : 'New interview'}
      </h2>

      {error && <p className="mt-4 text-[13px] text-critical">{error}</p>}

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field label="Candidate name" required>
          <input className={CONTROL} value={value.candidate_name} autoFocus
            onChange={(e) => set('candidate_name', e.target.value)} placeholder="Priya Sharma" />
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
        <Field label="Job description" hint="Optional. Cited as [JD] in follow-ups.">
          <textarea
            className={`${CONTROL} h-28 resize-y py-3 leading-relaxed`}
            value={value.job_description}
            onChange={(e) => set('job_description', e.target.value)}
            placeholder="Paste the job description…"
          />
        </Field>
      </div>

      <div className="mt-8 flex items-center gap-3">
        <Button onClick={onSave} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </Card>
  )
}
