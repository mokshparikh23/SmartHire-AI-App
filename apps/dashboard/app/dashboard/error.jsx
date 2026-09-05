'use client'

import { useEffect } from 'react'
import { Card, Button } from '@smarthire/ui'

/*
  Covers all five dashboard pages and their loading states — the router nests
  ErrorBoundary outside LoadingBoundary, so one file at this level is enough.
  It does NOT cover app/dashboard/layout.jsx itself; app/error.jsx does that.

  The prop is `retry`, not `reset`. `reset` still exists but `retry` became the
  stable name in 16.3.0 (docs/01-app/03-api-reference/03-file-conventions/error.md).
*/
export default function DashboardError({ error, retry }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <Card className="border-critical/25">
      <h1 className="display text-[1.75rem] text-ink">Something went wrong.</h1>
      <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted">
        We could not load this page. If you have been signed in a while, your session may
        have expired — signing in again usually fixes it.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={() => retry()}>Try again</Button>
        <Button href="/login" variant="secondary">Sign in again</Button>
      </div>
      {error?.digest && (
        <p className="mt-5 text-[12px] text-faint" data-numeric>Reference {error.digest}</p>
      )}
    </Card>
  )
}
