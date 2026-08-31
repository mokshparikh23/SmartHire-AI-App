'use client'

import { useEffect } from 'react'
import { Container, Button } from 'smarthire-ui'

/*
  ADMIN SPLIT 2026-09-01 ─ adapted from apps/site/app/error.jsx, with one rule
  that matters more here than on either other app.

  NOTHING FROM `error` IS RENDERED EXCEPT `error.digest`.

  Every page on this origin queries with createAdminClient(), the service-role
  client that bypasses RLS. A throw on one of those paths carries Postgres text —
  table names, column names, constraint names, sometimes a fragment of a row —
  and this boundary is the one place it could reach a browser wholesale. Next
  already redacts server errors in production and replaces the message with a
  digest, but that is a property of the framework's build mode, not a decision
  this file made, and `error.message` is right there in the props. So the
  omission is written down: the digest is the reference, the console is where the
  detail goes, and the server log is where it is read.

  This is the same discipline as fail() in the API routes — see lib/http.js in
  apps/web — applied to the render path instead of the fetch path.

  No global-error.jsx, matching both siblings: it would only catch a throw in the
  root layout and would have to ship its own <html> and styles to be useful.
*/
export default function AdminError({ error, retry }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <Container className="flex min-h-screen flex-col items-center justify-center text-center">
      <h1 className="display text-[2.5rem] text-ink">Something went wrong.</h1>
      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
        This page failed to load. Trying again usually works; if it does not, the
        reference below will be in the server log.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={() => retry()} size="lg">Try again</Button>
      </div>
      {error?.digest && (
        <p className="mt-8 text-[12px] text-faint" data-numeric>Reference {error.digest}</p>
      )}
    </Container>
  )
}
