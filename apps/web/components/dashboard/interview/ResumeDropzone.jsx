'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui'
import Icon from '@/components/ui/Icon'
import { MAX_RESUME_BYTES } from '@/lib/resume'

/*
  RESUME-UPLOAD 2026-08-30

  The drop target and its states. Presentational — it never uploads, parses or
  touches the network; ResumePanel owns all of that.

  Tonal descendant of the desktop's upload zone (apps/desktop/src/pages/
  InterviewSetup.jsx, now unrouted) with two deliberate departures:

  * a real <button>, not a clickable <div>. That buys Enter and Space, a tab
    stop, and the accent focus ring from globals.css's base layer, for free.
  * no bouncing dots. globals.css zeroes every animation duration under
    prefers-reduced-motion, and three dots with staggered animation-delay freeze
    at their 0% position — a meaningless static row that reads as broken. The
    text carries progress instead, announced through role="status".
*/

const MB = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`

export default function ResumeDropzone({
  phase,          // 'idle' | 'uploading' | 'parsing' | 'ready' | 'error'
  fileName,
  summary,
  error,
  onFile,
  onCancel,
  onRemove,
  onPaste,
}) {
  const inputRef = useRef(null)
  const [over, setOver] = useState(false)
  /* dragEnter/dragLeave fire for every child element crossed, so a plain boolean
     flickers the border on and off as the pointer moves across the icon and the
     label. Counting entries against leaves is the standard fix. */
  const depth = useRef(0)

  /* Without this, dropping a PDF one pixel outside the zone makes the browser
     navigate away from a half-filled form and lose everything typed so far. */
  useEffect(() => {
    const stop = (e) => e.preventDefault()
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('dragover', stop)
      window.removeEventListener('drop', stop)
    }
  }, [])

  const pick = () => inputRef.current?.click()

  const take = (files) => {
    const file = files?.[0]
    if (file) onFile(file)
    // Reset so choosing the same file twice still fires a change event.
    if (inputRef.current) inputRef.current.value = ''
  }

  const drop = (e) => {
    e.preventDefault()
    depth.current = 0
    setOver(false)
    take(e.dataTransfer?.files)
  }

  const busy = phase === 'uploading' || phase === 'parsing'

  const hidden = (
    /* sr-only rather than display:none (the desktop's approach) so the element
       stays in the layout tree and can be focused programmatically after an
       invalid-file error. tabIndex -1 and aria-hidden keep it out of the tab
       order, where it would otherwise duplicate the button above. */
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf,.pdf"
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => take(e.target.files)}
    />
  )

  if (busy) {
    return (
      <>
        <div role="status" aria-live="polite" className="rounded-xl border border-line bg-canvas p-5">
          <div className="flex items-center gap-3">
            <Icon name="file" size={16} className="shrink-0 text-muted" />
            <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{fileName}</p>
            <button
              type="button"
              onClick={onCancel}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-canvas-2 hover:text-ink"
            >
              Cancel
            </button>
          </div>
          {/* One label for one request. Uploading and parsing happen inside a
              single POST, and fetch() cannot tell us when the body finished
              sending — so splitting this into "Uploading…" then "Reading…" on a
              timer would be invented progress rather than reported progress. */}
          <p className="mt-2 text-[13px] text-muted">Uploading and reading the PDF…</p>
          {/* animate-pulse keyframes are 0%,100% { opacity: 1 }, so frozen by
              reduced motion this stays fully visible rather than vanishing. */}
          <span aria-hidden="true" className="mt-3 block h-0.5 w-full overflow-hidden rounded-full bg-line">
            <span className="block h-full w-1/3 animate-pulse rounded-full bg-ink/60" />
          </span>
        </div>
        {hidden}
      </>
    )
  }

  if (phase === 'ready') {
    return (
      <>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-canvas px-4 py-3">
          <Icon name="file" size={16} className="shrink-0 text-muted" />
          <p className="min-w-0 flex-1 truncate text-[14px] text-ink">{fileName}</p>
          {/* The honest version of the desktop's "{n} chars extracted". */}
          {summary && <p className="shrink-0 text-[12px] text-muted">{summary}</p>}
          <Button size="sm" variant="secondary" icon="upload" onClick={pick}>Replace</Button>
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-critical-soft hover:text-critical"
          >
            Remove
          </button>
        </div>
        {hidden}
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={pick}
        onDragEnter={(e) => { e.preventDefault(); depth.current += 1; setOver(true) }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => { depth.current -= 1; if (depth.current <= 0) { depth.current = 0; setOver(false) } }}
        onDrop={drop}
        aria-describedby="resume-drop-hint"
        className={[
          'flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed',
          'px-6 py-10 text-center transition-colors duration-150',
          over ? 'border-accent bg-accent-soft' : 'border-line bg-canvas hover:border-ink/30 hover:bg-canvas-2',
        ].join(' ')}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-canvas-2 text-ink-soft">
          <Icon name="upload" size={18} />
        </span>
        <span className="text-[14px] font-medium text-ink">
          {over ? 'Drop to add' : 'Drop a résumé PDF, or click to choose'}
        </span>
        <span id="resume-drop-hint" className="text-[12px] text-muted">
          PDF · up to {MB(MAX_RESUME_BYTES)} · optional, the copilot works from the conversation alone
        </span>
      </button>

      {error && (
        /* A warning strip, not a red error card: every failure here has a
           recovery path, and that path has to stay in reach. */
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft p-4">
          <Icon name="warning" size={15} className="mt-0.5 shrink-0 text-warning" />
          <div className="min-w-0 text-[13px] leading-relaxed text-ink">{error}</div>
        </div>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={onPaste}
          className="rounded-lg text-[13px] font-medium text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Paste the text instead
        </button>
      </div>

      {hidden}
    </>
  )
}
