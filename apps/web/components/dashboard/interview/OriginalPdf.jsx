'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui'
import Icon from '@/components/ui/Icon'
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
*/
export default function OriginalPdf({ path, fileName }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)

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

  if (!url) return <Skeleton className="h-[70vh] min-h-[420px] w-full rounded-xl" />

  return (
    /*
      <object>, not <iframe>, for exactly one reason: it renders its children as
      native fallback content when the browser has no inline PDF viewer — iOS
      Safari and several Android browsers. An <iframe> would show a blank
      rectangle and need JS to detect that it had.
    */
    <object
      data={url}
      type="application/pdf"
      aria-label={`Original résumé, ${fileName || 'PDF'}`}
      className="h-[70vh] min-h-[420px] w-full rounded-xl border border-line bg-canvas-2"
    >
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-canvas-2 text-faint">
          <Icon name="file" size={22} />
        </span>
        <p className="text-[15px] font-medium text-ink">{fileName || 'Résumé'}</p>
        <p className="max-w-sm text-[13px] text-muted">This browser cannot show PDFs inline.</p>
        {/* href is https, so Button takes its plain-anchor branch rather than
            routing a signed storage URL through next/link. */}
        <Button as="a" href={url} target="_blank" rel="noreferrer"
          variant="secondary" size="sm" icon="download">
          Open the file
        </Button>
      </div>
    </object>
  )
}
