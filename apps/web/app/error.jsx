'use client'

import { useEffect } from 'react'
import { Container, Button } from 'smarthire-ui'

/*
  The outer net. Needed because app/dashboard/error.jsx cannot catch a throw
  inside app/dashboard/layout.jsx — an error boundary never covers the layout in
  its own segment.

  No global-error.jsx: that would only catch a throw in the root layout, and it
  has to ship its own <html> and styles to be useful.
*/
export default function RootError({ error, retry }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <Container className="flex min-h-screen flex-col items-center justify-center text-center">
      <h1 className="display text-[2.5rem] text-ink">Something went wrong.</h1>
      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
        This page failed to load. Trying again usually works; if it does not, signing in
        again will.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={() => retry()} size="lg">Try again</Button>
        {/* SPLIT 2026-09-01: "/" is the marketing site now, and it is the wrong
            place to send somebody whose dashboard just failed — they have an
            account and were trying to use it. This boundary sits above the
            authenticated app, so the way back is into the app.
            <Button href="/" variant="secondary" size="lg">Back to the homepage</Button> */}
        <Button href="/dashboard" variant="secondary" size="lg">Back to your dashboard</Button>
      </div>
      {error?.digest && (
        <p className="mt-8 text-[12px] text-faint" data-numeric>Reference {error.digest}</p>
      )}
    </Container>
  )
}
