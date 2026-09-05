'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Button } from '@smarthire/ui'
import Icon from '@smarthire/ui/Icon'
import { Skeleton } from '@/components/ui/Skeleton'
import { RESUME_BUCKET } from '@/lib/resume'

/*
  RESUME-UPLOAD 2026-08-30

  The stored PDF, beside the parsed fields so the interviewer can check one
  against the other.

  The URL is minted HERE, in the browser, with the anon key — that is what the
  bucket's one permissive policy (select, own folder) is for, and it saves a
  route. Sixty seconds because a signed URL is a bearer token: anyone holding it
  can read the file, so it should outlive the click that produced it and nothing
  more. Fetched on first open of the tab rather than on mount, since a URL minted
  for a tab nobody clicks is a wasted round trip that expires unused.

  RESUME-VIEW 2026-09-01 ─ WHY THE PAGE CAME OUT POSTAGE-STAMP SIZED.

  The form sits in `max-w-4xl px-8` (app/dashboard/layout.jsx), so this pane is
  about 760px wide. Chrome's viewer, given no instructions, opens its thumbnail
  rail — which ate ~40% of that — and then picked 60% zoom for what was left. A
  resume rendered at 60% of half of 760px is not readable, and nothing in the app
  was telling the viewer otherwise.

  Two changes, and they fix different halves of it:

    1. The URL FRAGMENT below tells the viewer how to open. Fragments are never
       sent to the server, so this is free and cannot disturb the signature.
    2. EXPAND, because parameters cannot conjure width that the column does not
       have. A resume is a document to read, and reading it should not be capped
       by the width of the form that happens to own it.

  Expand is a CSS class swap on this same element — deliberately NOT a portal, a
  second <object>, or requestFullscreen(). All three would re-create the embed,
  which re-fetches the URL; the signed URL is good for sixty seconds, so an
  expand two minutes after the tab was opened would land on an expired token and
  break the very thing the button promises. Swapping classes resizes the plugin
  in place: no request, no expiry, no re-render of the document.
*/

/* Adobe's open parameters, as much of them as Chrome implements.
   FitH is the one that matters — it fits the PAGE WIDTH to the pane, which is
   the whole complaint. navpanes=0 collapses the thumbnail rail; on a viewer that
   ignores it the FitH zoom still applies, so this degrades to "merely correct".
   The toolbar is deliberately LEFT ON: it carries zoom, print and download, and
   this pane has no replacement for them. */
const VIEWER_PARAMS = '#view=FitH&navpanes=0&pagemode=none'

export default function OriginalPdf({ path, fileName }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  const [big, setBig] = useState(false)
  const closeRef = useRef(null)

  useEffect(() => {
    if (!path) return
    let live = true
    setUrl(null)
    setFailed(false)

    createClient()
      .storage.from(RESUME_BUCKET)
      .createSignedUrl(path, 60)
      .then(({ data, error }) => {
        if (!live) return
        if (error || !data?.signedUrl) setFailed(true)
        else setUrl(data.signedUrl)
      })
      .catch(() => { if (live) setFailed(true) })

    return () => { live = false }
  }, [path])

  /* Expanded, this is a modal in every way that matters to someone not using a
     mouse, so it owes them the three things a modal owes: Escape closes it, the
     page behind it does not scroll, and focus lands somewhere inside it. */
  useEffect(() => {
    if (!big) return
    const onKey = (e) => { if (e.key === 'Escape') setBig(false) }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [big])

  if (failed) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft p-4">
        <Icon name="warning" size={15} className="mt-0.5 shrink-0 text-warning" />
        <div className="text-[13px] leading-relaxed text-ink">
          Could not load the file.
          <span className="mt-1 block text-muted">
            The parsed details on the Edit tab are unaffected.
          </span>
        </div>
      </div>
    )
  }

  // Was h-[70vh]; the skeleton has to match the pane it stands in for, or the
  // panel jumps when the URL arrives.
  // if (!url) return <Skeleton className="h-[70vh] min-h-[420px] w-full rounded-xl" />
  if (!url) return <Skeleton className="h-[78vh] min-h-[520px] w-full rounded-xl" />

  return (
    <div
      {...(big ? { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Original resume, ${fileName || 'PDF'}` } : {})}
      className={big
        ? 'fixed inset-0 z-50 flex flex-col gap-3 bg-paper p-4 sm:p-6'
        : 'flex flex-col gap-2'}
    >
      {/* The viewer's own title bar shows the storage filename, which is a UUID
          by design (resumePath() in lib/storage.js — the candidate's own filename
          is PII we keep out of URLs and access logs). So the real name is shown
          here instead, where it is ours to render. */}
      <div className="flex items-center gap-3">
        <Icon name="file" size={15} className="shrink-0 text-muted" />
        <p className="min-w-0 flex-1 truncate text-[13px] text-muted">{fileName || 'Resume'}</p>
        <button
          type="button"
          ref={closeRef}
          onClick={() => setBig(v => !v)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-canvas-2 hover:text-ink"
        >
          <Icon name={big ? 'close' : 'expand'} size={14} />
          {big ? 'Close' : 'Expand'}
        </button>
      </div>

      {/*
        <object>, not <iframe>, for exactly one reason: it renders its children as
        native fallback content when the browser has no inline PDF viewer — iOS
        Safari and several Android browsers. An <iframe> would show a blank
        rectangle and need JS to detect that it had.

        RESUME-VIEW 2026-09-01: one element for both sizes, and it must stay one
        element — see the note at the top. `min-h-0` is what lets flex-1 actually
        shrink to the container instead of overflowing it.
      */}
      <object
        data={`${url}${VIEWER_PARAMS}`}
        type="application/pdf"
        aria-label={`Original resume, ${fileName || 'PDF'}`}
        className={[
          'w-full rounded-xl border border-line bg-canvas-2',
          // className={...'h-[70vh] min-h-[420px]'} — a third of the screen for
          // an A4 page, in a viewer that then subtracts its own toolbar.
          big ? 'min-h-0 flex-1' : 'h-[78vh] min-h-[520px]',
        ].join(' ')}
      >
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-canvas-2 text-faint">
            <Icon name="file" size={22} />
          </span>
          <p className="text-[15px] font-medium text-ink">{fileName || 'Resume'}</p>
          <p className="max-w-sm text-[13px] text-muted">This browser cannot show PDFs inline.</p>
          {/* href is https, so Button takes its plain-anchor branch rather than
              routing a signed storage URL through next/link. */}
          <Button as="a" href={url} target="_blank" rel="noreferrer"
            variant="secondary" size="sm" icon="download">
            Open the file
          </Button>
        </div>
      </object>
    </div>
  )
}
