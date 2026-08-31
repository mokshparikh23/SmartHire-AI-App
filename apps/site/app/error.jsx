'use client'

import { useEffect } from 'react'
import { Container, Button } from 'smarthire-ui'

/*
  SPLIT 2026-09-01: adapted from apps/web/app/error.jsx.

  Two differences, both because of what this app is. There is no nested layout
  to fail underneath, so this is the only boundary the site needs — and the
  recovery line does not mention signing in, because nothing here has a session
  to lapse. If a page on this site fails, retrying is genuinely the whole
  remedy.

  No global-error.jsx, same as next door: that would only catch a throw in the
  root layout, and it has to ship its own <html> and styles to be useful.
*/
export default function SiteError({ error, retry }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <Container className="flex min-h-screen flex-col items-center justify-center text-center">
      <h1 className="display text-[2.5rem] text-ink">Something went wrong.</h1>
      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
        This page failed to load. Trying again usually works.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={() => retry()} size="lg">Try again</Button>
        <Button href="/" variant="secondary" size="lg">Back to the homepage</Button>
      </div>
      {error?.digest && (
        <p className="mt-8 text-[12px] text-faint" data-numeric>Reference {error.digest}</p>
      )}
    </Container>
  )
}
