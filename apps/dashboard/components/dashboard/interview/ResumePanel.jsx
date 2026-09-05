'use client'

import { useRef, useState } from 'react'
import { CONTROL, Field } from '@smarthire/ui'
// Only the removed note used an icon here.
// import Icon from '@smarthire/ui/Icon'
import {
  BLANK_RESUME, MAX_RESUME_BYTES, isEmptyRecord, normalizeParsed, summarise,
} from '@/lib/resume'
import ResumeDropzone from './ResumeDropzone'
import ResumeEditor, { ResumeEditorSkeleton } from './ResumeEditor'
import OriginalPdf from './OriginalPdf'

/*
  RESUME-UPLOAD 2026-08-30

  The whole resume half of the interview form: intake, the structured editor, the
  original document, and consent.

  OWN-CV 2026-09-01: and no longer consent — the tick was removed. The long note
  at the bottom of this file, where it stood, is the record of why.

  WHY THIS NEEDS ensureProfileId(). The parse route writes resume_file_path, and
  the migration deliberately removed that column from the browser's update grant
  — only the service-role route may move it, which is what makes the
  consent-reset trigger trustworthy. A route that writes a row needs a row to
  write to, so a resume dropped on a never-saved interview has to create one
  first. The parent owns that, because it owns the Supabase client and the list
  the new row has to appear in.
*/
export default function ResumePanel({ value, onChange, ensureProfileId }) {
  const [phase, setPhase] = useState(value.resume_file_path ? 'ready' : 'idle')
  const [view, setView] = useState('edit')
  const [error, setError] = useState(null)
  const [pasting, setPasting] = useState(false)
  // OWN-CV 2026-09-01: this drove the "the tick was cleared because the resume
  // changed" warning under the checkbox. With no checkbox there is nothing to
  // clear and nothing to warn about — a replaced resume is simply used.
  // const [consentReset, setConsentReset] = useState(false)
  // The name of the file currently in flight, so the progress card shows what
  // the user actually dropped rather than a placeholder.
  const [pendingName, setPendingName] = useState('')
  const abortRef = useRef(null)

  const record = value.resume_parsed || BLANK_RESUME
  const hasFile = Boolean(value.resume_file_path)
  const hasRecord = !isEmptyRecord(value.resume_parsed)

  /*
    Anything to consent to → ask. Keeping `value.resume` in this test matters:
    drop it and every interview whose resume was pasted before this feature
    existed would silently lose its consent flag on the next save, because
    toRow() forces consent false when there is no resume.

    OWN-CV 2026-09-01: the test is unchanged and so is the reasoning behind its
    three branches — a file, pasted text, or an edited record each count as a
    resume, and toRow() uses the same rule to decide what to write. What it gates
    is now a line of explanation rather than a checkbox.
  */
  // Its only reader was the note below, which is now commented out with it.
  // const hasResume = hasFile || value.resume.trim().length > 0 || hasRecord

  const set = (k, v) => onChange({ ...value, [k]: v })

  const upload = async (file) => {
    setError(null)

    // Checked here only so the user hears about it instantly; the route and the
    // bucket are the real limits.
    if (file.type && file.type !== 'application/pdf') {
      return setError('Only PDF files are supported. Paste the text instead if you have a Word document.')
    }
    if (file.size > MAX_RESUME_BYTES) {
      return setError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ` +
        `${MAX_RESUME_BYTES / 1024 / 1024} MB — a resume that large is usually a scan, ` +
        'which has no text to read anyway.')
    }

    setPendingName(file.name || 'Resume')
    setPhase('uploading')
    const ac = new AbortController()
    abortRef.current = ac

    try {
      /* CANDIDATE-FIRST 2026-09-01: the silent abort lived here. ensureProfileId()
         returned null when the interview had no name, and this put the dropzone
         back to idle with no spinner, no message and nothing to retry — the whole
         "app me error aata hai" report. It throws now, so the catch below is the
         one place a failed attach is reported, and it reports it at the dropzone. */
      // const profileId = await ensureProfileId()
      // if (!profileId) { setPhase('idle'); return }
      const profileId = await ensureProfileId()

      const body = new FormData()
      body.append('file', file)
      body.append('profileId', profileId)

      const res = await fetch('/api/resume/parse', { method: 'POST', body, signal: ac.signal })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        setPhase('idle')
        return setError(json.error || 'Could not read that resume. Paste the text instead.')
      }

      const p = json.profile
      onChange({
        ...value,
        id:               p.id,
        resume:           p.resume || '',
        resume_parsed:    normalizeParsed(p.resume_parsed),
        resume_file_path: p.resume_file_path,
        resume_file_name: p.resume_file_name,
        // The route forces this false and the trigger backs it up. Reflecting it
        // rather than preserving the old value is the point — see below.
        // resume_consent:   false,
        /* OWN-CV 2026-09-01: still reflecting what the route wrote, and the
           route now writes true — a stored resume is a used resume. Mirroring
           the response rather than assuming keeps this honest if the two ever
           disagree again. */
        resume_consent:   p.resume_consent === true,
      })
      // setConsentReset(value.resume_consent === true)
      setPasting(false)
      setView('edit')
      setPhase('ready')
    } catch (e) {
      setPhase('idle')
      // CANDIDATE-FIRST 2026-09-01: ensureProfileId() throws here now, and its
      // message says what actually went wrong with the row. A bare "Upload
      // failed. Check your connection" would be a lie for that case, and the
      // user has no connection problem to go and check.
      // if (e?.name !== 'AbortError') setError('Upload failed. Check your connection and try again.')
      if (e?.name !== 'AbortError') {
        setError(e?.message
          ? `Could not attach the resume: ${e.message}`
          : 'Upload failed. Check your connection and try again.')
      }
    } finally {
      abortRef.current = null
    }
  }

  const cancel = () => { abortRef.current?.abort(); setPhase('idle') }

  /*
    Removing clears the record, the file pointer and the flag together — the same
    discipline the desktop wizard's skip() had. The row update is what actually
    detaches the file; the tombstone trigger then queues the bytes for deletion,
    so "Remove" really does remove it rather than just hiding it.
  */
  const remove = () => {
    onChange({
      ...value,
      resume: '', resume_parsed: null,
      resume_file_path: null, resume_file_name: null,
      resume_consent: false,
    })
    // setConsentReset(false)
    setError(null)
    setView('edit')
    setPhase('idle')
  }

  const busy = phase === 'uploading' || phase === 'parsing'

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[13px] font-medium text-ink">Resume</h3>

        {(hasRecord || hasFile) && (
          <div
            role="tablist"
            aria-label="Resume view"
            className="inline-flex items-center gap-0.5 rounded-full border border-line bg-paper p-1"
          >
            {[['edit', 'Edit'], ['pdf', 'Original PDF']].map(([key, label]) => {
              const on = view === key
              // Rendered always and visibly unavailable, rather than appearing
              // and disappearing: a control that comes and goes is harder to
              // learn than one that is present and says why it is off.
              const dead = key === 'pdf' && !hasFile
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`resume-tab-${key}`}
                  aria-controls={`resume-panel-${key}`}
                  aria-selected={on}
                  tabIndex={on ? 0 : -1}
                  disabled={dead}
                  title={dead ? 'No file — this resume was typed or pasted' : undefined}
                  onClick={() => setView(key)}
                  className={[
                    'rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors duration-150',
                    dead ? 'cursor-not-allowed text-faint'
                      : on ? 'bg-ink text-paper' : 'text-muted hover:text-ink',
                  ].join(' ')}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* hidden rather than conditional rendering, so switching to the PDF and
          back does not remount thirty inputs and lose scroll position. */}
      <div id="resume-panel-edit" role="tabpanel" aria-labelledby="resume-tab-edit" hidden={view !== 'edit'}>
        {!hasRecord && !busy && !pasting && (
          <ResumeDropzone
            phase={hasFile ? 'ready' : 'idle'}
            fileName={value.resume_file_name}
            error={error}
            onFile={upload}
            onRemove={remove}
            onPaste={() => { setPasting(true); setError(null) }}
          />
        )}

        {busy && (
          <>
            <ResumeDropzone phase={phase} fileName={pendingName} onCancel={cancel} />
            <ResumeEditorSkeleton className="mt-5" />
          </>
        )}

        {pasting && !busy && (
          <>
            <Field label="Paste the resume" hint="Optional — the copilot works from the conversation alone without it.">
              <textarea
                className={`${CONTROL} h-40 resize-y py-3 leading-relaxed`}
                value={value.resume}
                onChange={(e) => set('resume', e.target.value)}
                placeholder="Paste resume text…"
                autoFocus
              />
            </Field>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setPasting(false)}
                className="rounded-lg text-[13px] font-medium text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
              >
                Back to upload
              </button>
            </div>
          </>
        )}

        {hasRecord && !busy && (
          <>
            {/* CANDIDATE-FIRST 2026-09-01: error={error} was missing on this one.
                The idle dropzone above had it, so a first upload reported its
                failure and a REPLACEMENT reported nothing — the zone just snapped
                back to the old resume as if the drop had never happened. */}
            <ResumeDropzone
              phase="ready"
              fileName={value.resume_file_name || 'Typed by hand'}
              summary={summarise(record)}
              error={error}
              onFile={upload}
              onRemove={remove}
            />
            <div className="mt-5">
              <ResumeEditor value={record} onChange={(rec) => set('resume_parsed', rec)} />
            </div>
          </>
        )}
      </div>

      <div id="resume-panel-pdf" role="tabpanel" aria-labelledby="resume-tab-pdf" hidden={view !== 'pdf'}>
        {/* Mounted only once the tab is actually opened, so no signed URL is
            minted for a tab nobody clicks. */}
        {view === 'pdf' && hasFile && (
          <OriginalPdf path={value.resume_file_path} fileName={value.resume_file_name} />
        )}
      </div>

      {/*
        OWN-CV 2026-09-01 ─ THE TICK IS GONE.

        What stood here was a checkbox reading "Use my resume in this interview",
        unticked by default, that decided whether buildSystemPrompt() included
        the resume at all. It was the last of the interviewer-side product left
        in this panel: a second yes, asked of the one person who had already said
        yes by uploading their own CV to their own interview.

        It did not protect anyone and it cost people interviews. Upload a
        resume, miss the box — it starts unticked, and the parse route cleared it
        again on every replacement — and the session runs generic, with nothing
        on screen saying why. "Attached but unused" is not a state a user asked
        for.

        The rule is the upload. A resume on the interview is a resume in the
        prompt; no resume and the copilot works from the conversation alone,
        which is the same branch an unticked box used to reach. NOT using it is
        still one click — Remove, above — and that path deletes the file
        instead of leaving it on the account behind a false flag.

        The COLUMN survives this. `resume_consent` is written true whenever a
        resume exists (lib/resume.js toRow, /api/resume/parse) because a desktop
        build older than this one still gates on it, and a stale false there
        would silently drop the resume for exactly the users who cannot see why.

          <label …>
            <input type="checkbox" checked={value.resume_consent}
                   onChange={(e) => { set('resume_consent', e.target.checked); setConsentReset(false) }} />
            <span>Use my resume in this interview.
              <span>Leave this unticked and neither the details nor the file are sent to
                the model — answers will come only from what is said in the room.
                {hasFile && ' The original PDF stays on your account either way; use Remove above to delete it.'}
              </span>
            </span>
          </label>
          {consentReset && <p>The tick was cleared because the resume changed. Confirm again for the new file.</p>}
      */}
      {/*
        The explanatory note is off the panel. The behaviour it described is
        unchanged — the resume still goes into every session for this interview,
        and Remove / clearing the box are still the ways off — but the panel
        already shows the file, the Remove button and the parsed record, so the
        paragraph was restating what is on screen.

      {hasResume && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-canvas-2 p-4 text-[13px] leading-relaxed text-muted">
          <Icon name="file" size={14} className="mt-0.5 shrink-0 text-muted" />
          <span>
            Says what happens, because it now happens without being asked
            for — and says where the off switch is, since it is no longer a
            box on this screen.

            Three branches and not two, because "Remove above" is only true
            where the button is: ResumeDropzone renders it at phase 'ready'
            only, which this panel reaches when there is a file OR a parsed
            record. Pasted text with neither shows the idle zone, where the
            way to take a resume off is to clear the box. Pointing at a
            button that is not on screen is the failure this whole change is
            about, in miniature.

            This resume is used in every session for this interview, and anything
            drawn from it is tagged [resume] in the answer.
            {hasFile ? ' The original PDF stays on your account until you remove it above.'
              : hasRecord ? ' Use Remove above to take it off this interview.'
                : ' Clear the pasted text to take it off this interview.'}
          </span>
        </p>
      )}
      */}
    </div>
  )
}
