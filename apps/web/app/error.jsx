'use client'

import { useEffect } from 'react'
import { Container, Button } from '@/components/ui'

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
        <Button href="/" variant="secondary" size="lg">Back to the homepage</Button>
      </div>
      {error?.digest && (
        <p className="mt-8 text-[12px] text-faint" data-numeric>Reference {error.digest}</p>
      )}
    </Container>
  )
}
