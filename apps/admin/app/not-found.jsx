import { Container, Button } from '@smarthire/ui'

/*
  ADMIN SPLIT 2026-09-01 ─ deliberately the thinnest of the three 404 pages.

  apps/marketing's version lists everything the site has, because a stranger who
  mistypes a marketing URL needs a way back in. Nobody reaches this one by
  accident: the only people who can render anything on this origin are admins,
  and the only way here is typing a URL.

  It says nothing about what does exist. Not for secrecy — the hostname is in
  Certificate Transparency logs and /login is public, so a route list is not the
  secret worth keeping — but because a signed-out visitor and a signed-in
  non-admin both see this page too, and neither has any use for a map of the
  console. The single link goes to /admin, which is itself gated.
*/
export const metadata = {
  title: 'Not found — Admin',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <Container className="flex min-h-[70vh] flex-col items-center justify-center py-24 text-center">
      <span className="eyebrow mb-6">Error 404</span>

      <h1 className="hl text-[clamp(2rem,4vw,2.75rem)] text-ink">
        There is no page at this address.
      </h1>

      <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">
        Check the URL, or go back to the console.
      </p>

      <div className="mt-10">
        <Button href="/admin" size="lg" iconRight="arrowRight">Back to the console</Button>
      </div>
    </Container>
  )
}
