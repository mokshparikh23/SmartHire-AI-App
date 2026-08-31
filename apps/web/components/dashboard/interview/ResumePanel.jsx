'use client'

import { useRef, useState } from 'react'
import { CONTROL, Field } from 'smarthire-ui'
import Icon from 'smarthire-ui/Icon'
import {
  BLANK_RESUME, MAX_RESUME_BYTES, isEmptyRecord, normalizeParsed, summarise,
} from '@/lib/resume'
import ResumeDropzone from './ResumeDropzone'
import ResumeEditor, { ResumeEditorSkeleton } from './ResumeEditor'
import OriginalPdf from './OriginalPdf'

/*
  RESUME-UPLOAD 2026-08-30

  The whole résumé half of the interview form: intake, the structured editor, the
  original document, and consent.

  WHY THIS NEEDS ensureProfileId(). The parse route writes resume_file_path, and
  the migration deliberately removed that column from the browser's update grant
  — only the service-role route may move it, which is what makes the
  consent-reset trigger trustworthy. A route that writes a row needs a row to
  write to, so a résumé dropped on a never-saved interview has to create one
  first. The parent owns that, because it owns the Supabase client and the list
  the new row has to appear in.
*/
export default function ResumePanel({ value, onChange, ensureProfileId }) {
  const [phase, setPhase] = useState(value.resume_file_path ? 'ready' : 'idle')
  const [view, setView] = useState('edit')
  const [error, setError] = useState(null)
  const [pasting, setPasting] = useState(false)
  const [consentReset, setConsentReset] = useState(false)
  // The name of the file currently in flight, so the progress card shows what
  // the user actually dropped rather than a placeholder.
  const [pendingName, setPendingName] = useState('')
  const abortRef = useRef(null)

  const record = value.resume_parsed || BLANK_RESUME
  const hasFile = Boolean(value.resume_file_path)
  const hasRecord = !isEmptyRecord(value.resume_parsed)

  /*
    Anything to consent to → ask. Keeping `value.resume` in this test matters:
    drop it and every interview whose résumé was pasted before this feature
    existed would silently lose its consent flag on the next save, because
    toRow() forces consent false when there is no résumé.
  */
  const hasResume = hasFile || value.resume.trim().length > 0 || hasRecord

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
        `${MAX_RESUME_BYTES / 1024 / 1024} MB — a résumé that large is usually a scan, ` +
        'which has no text to read anyway.')
    }

    setPendingName(file.name || 'Résumé')
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
        return setError(json.error || 'Could not read that résumé. Paste the text instead.')
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
        resume_consent:   false,
      })
      setConsentReset(value.resume_consent === true)
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
          ? `Could not attach the résumé: ${e.message}`
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
    setConsentReset(false)
    setError(null)
    setView('edit')
    setPhase('idle')
  }

  const busy = phase === 'uploading' || phase === 'parsing'

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[13px] font-medium text-ink">Résumé</h3>

        {(hasRecord || hasFile) && (
          <div
            role="tablist"
            aria-label="Résumé view"
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
                  title={dead ? 'No file — this résumé was typed or pasted' : undefined}
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
            <Field label="Paste the résumé" hint="Optional — the copilot works from the conversation alone without it.">
              <textarea
                className={`${CONTROL} h-40 resize-y py-3 leading-relaxed`}
                value={value.resume}
                onChange={(e) => set('resume', e.target.value)}
                placeholder="Paste résumé text…"
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
                back to the old résumé as if the drop had never happened. */}
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

      {hasResume && (
        <>
          <label className={`mt-4 flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
            value.resume_consent ? 'border-positive/40 bg-positive-soft' : 'border-line bg-canvas-2'
          }`}>
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-current"
              checked={value.resume_consent}
              onChange={(e) => { set('resume_consent', e.target.checked); setConsentReset(false) }}
            />
            {/* CONCEPT 2026-08-30: this read "The candidate has agreed to their
                résumé being used by the copilot during this interview." — the
                interviewer confirming permission for someone else's document.
                The résumé is the reader's own now, so the tick is a switch over
                their own file. The GATE is unchanged: `resume_consent` still
                decides whether buildSystemPrompt() includes the RÉSUMÉ block at
                all, and unticked still means the text never reaches the model. */}
            <span className="text-[13px] leading-relaxed text-ink">
              Use my résumé in this interview.
              <span className="mt-1 block text-muted">
                {/* RESUME-UPLOAD 2026-08-30: the old copy said only that the
                    résumé is "stored but never sent to the model". With the
                    original PDF now kept at rest, that is no longer the whole
                    truth, and unticking is no longer a way to get rid of it —
                    so this has to say where the file lives and where delete is. */}
                Leave this unticked and neither the details nor the file are sent to
                the model — answers will come only from what is said in the room.
                {hasFile && ' The original PDF stays on your account either way; use Remove above to delete it.'}
              </span>
            </span>
          </label>

          {consentReset && (
            <p className="mt-2 flex items-start gap-2 text-[12px] text-muted">
              <Icon name="warning" size={13} className="mt-0.5 shrink-0 text-warning" />
              {/* was "Consent was cleared because the résumé changed." */}
              The tick was cleared because the résumé changed. Confirm again for the new file.
            </p>
          )}
        </>
      )}
    </div>
  )
}
