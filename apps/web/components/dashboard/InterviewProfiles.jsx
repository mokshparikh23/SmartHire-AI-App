'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, Button, Badge, EmptyState } from '@/components/ui'
import Icon from '@/components/ui/Icon'
import { BLANK_ROW, hydrate, toRow } from '@/lib/resume'
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

export default function InterviewProfiles({ initialProfiles, userId }) {
  const [profiles, setProfiles] = useState(initialProfiles)
  const [editing, setEditing]   = useState(null)   // row being edited, or BLANK_ROW for new
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState(null)

  const supabase = createClient()

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
    // if (!form.candidate_name.trim()) return setError('Candidate name is required.')
    if (!form.candidate_name.trim()) return setError('Give this interview a name.')

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
   * A résumé dropped on a never-saved interview has nothing to attach to: the
   * parse route writes resume_file_path, which the browser is not granted, so
   * the file cannot be recorded client-side afterwards either. Saving the row at
   * the moment of the drop is the honest resolution — the user has just handed
   * us their own CV, so an interview existing for it is expected, and it is
   * visible in the list rather than held in limbo.
   *
   * Returns null and surfaces the reason if it cannot, so the panel can stop
   * cleanly instead of uploading into nowhere.
   */
  const ensureProfileId = async () => {
    if (editing?.id) return editing.id

    if (!editing.candidate_name.trim()) {
      // setError('Add the candidate’s name before attaching a résumé.')
      setError('Name this interview before attaching a résumé.')
      return null
    }

    const { data, error: err } = await supabase
      .from('interview_profiles')
      .insert({ ...toRow(editing), user_id: userId })
      .select()
      .single()

    if (err) { setError(err.message); return null }

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
    if (err) return setError(err.message)
    setProfiles(prev => prev.filter(p => p.id !== id))
  }

  if (editing) {
    return (
      <InterviewForm
        value={editing}
        onChange={setEditing}
        onSave={save}
        onCancel={() => { setEditing(null); setError(null) }}
        busy={busy}
        error={error}
        ensureProfileId={ensureProfileId}
      />
    )
  }

  // BUGFIX 2026-08-30: was setEditing(p) / setEditing({ ...BLANK }). save() writes
  // null for every empty column, so the raw row fed `value.resume.trim()` a null
  // during ProfileForm's render — editing an interview saved without a résumé
  // threw a TypeError and took the page with it.
  const startNew  = () => { setEditing(hydrate(BLANK_ROW)); setError(null) }
  const startEdit = (p) => { setEditing(hydrate(p)); setError(null) }

  return (
    <div>
      {error && (
        <Card className="mb-5 border-critical/30 bg-critical-soft">
          <p className="text-[13px] text-critical">{error}</p>
        </Card>
      )}

      <div className="mb-5 flex justify-end">
        <Button icon="plus" onClick={startNew}>New interview</Button>
      </div>

      {profiles.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon="users"
            title="No interviews set up"
            // description="Add a candidate here, then pick them in the desktop app when the interview starts."
            description="Add an interview here, then pick it in the desktop app when the call starts."
            action={<Button icon="plus" onClick={startNew}>New interview</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {profiles.map(p => (
            <Card key={p.id} className="flex flex-wrap items-center gap-4">
              {/* Always a 36px slot, never conditional, so every row's text
                  starts on the same left edge. */}
              {p.company_domain
                ? <CompanyLogo src={logoUrl(p.company_domain, 72)} name={p.company} size={36} />
                : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas-2 text-faint">
                    <Icon name="building" size={17} />
                  </span>}

              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-ink">{p.candidate_name}</p>
                <p className="mt-0.5 text-[13px] text-muted">
                  {[p.role, p.company].filter(Boolean).join(' · ') || 'No role or company set'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* CONCEPT 2026-08-30: the badge read "consented / not
                    consented" — the interviewer confirming someone else's
                    permission. The document is the reader's own now, so the flag
                    means "in the prompt or not", which is what the badge says.
                    The column and the gate are untouched.
                    {p.resume_consent ? 'Résumé · consented' : 'Résumé · not consented'} */}
                {p.resume
                  ? <Badge tone={p.resume_consent ? 'positive' : 'warning'}>
                      {p.resume_consent ? 'Résumé · in use' : 'Résumé · not in use'}
                    </Badge>
                  : <Badge>No résumé</Badge>}
                {p.resume_file_path && <Badge>PDF</Badge>}
                {p.job_description && <Badge>JD</Badge>}
                {/* ANSWER-STYLE 2026-08-30: only the non-default is worth a
                    badge. A row reading "Standard" on every candidate is noise;
                    a row reading "Indian English" on one of five is the fact you
                    wanted to check before starting.

                    Default `neutral` tone and no className. Recolouring a Badge
                    through className puts two same-property utilities on one
                    element and Tailwind v4 picks the winner by stylesheet order
                    rather than by the order you wrote them — add a tone to TONES
                    in components/ui/index.jsx if a colour is ever wanted here. */}
                {p.answer_style === 'desi' && <Badge>Indian English</Badge>}
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => startEdit(p)}>Edit</Button>
                {/* RESUME-UPLOAD 2026-08-30: a bin, not a ✕. This deletes the
                    interview and now queues its stored PDF for deletion too; ✕
                    reads as "dismiss this row". */}
                {/* <Icon name="close" size={14} /> */}
                <Button size="sm" variant="ghost" onClick={() => remove(p.id)} disabled={busy}
                  aria-label={`Delete ${p.candidate_name}`}>
                  <Icon name="trash" size={15} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
