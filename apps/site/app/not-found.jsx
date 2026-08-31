import Icon from 'smarthire-ui/Icon'
import { Container, Button } from 'smarthire-ui'

/*
  SPLIT 2026-09-01: this file exists because of what its absence looked like.

  Without it, a wrong URL got Next's built-in 404 — two unstyled lines of
  system-font text — rendered inside this site's layout. So the page came out as
  the full header, a sliver of grey text, and the footer a screen further down.
  It does not read as "wrong address". It reads as "the site is broken and most
  of it is missing", which is exactly how it was reported.

  The commonest wrong URL is not a typo, either. It is an app path on the
  marketing origin: /dashboard, /login, /signup — from an old bookmark, or from
  editing the port in the address bar. next.config.mjs redirects those to the
  app, so they never reach here. What is left for this page is genuine
  not-found, and its job is to say which of the two sites you are on.
*/
export const metadata = {
  title: 'Page not found',
  // A 404 has nothing to offer a search engine, and indexing one is how a
  // "page not found" ends up ranking for the thing it failed to find.
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <Container className="flex min-h-[70vh] flex-col items-center justify-center py-24 text-center">
      <span className="eyebrow mb-6">Error 404</span>

      <h1 className="hl text-[clamp(2rem,4vw,2.75rem)] text-ink">
        There is no page at this address.
      </h1>

      <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">
        It may have moved when the site was reorganised, or the link may be wrong.
        Everything the site has is one of the four below.
      </p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Button href="/" size="lg" iconRight="arrowRight">Back to the homepage</Button>
        <Button href="/pricing" variant="secondary" size="lg">See pricing</Button>
      </div>

      <div className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-line-soft pt-9 text-[14px]">
        {[
          ['How it works', '/how-it-works'],
          ['Features', '/features'],
          ['Pricing', '/pricing'],
          ['Compare', '/compare'],
        ].map(([label, href]) => (
          <a key={href} href={href} className="text-muted transition-colors hover:text-ink">
            {label}
          </a>
        ))}
      </div>

      {/* The one thing this site cannot give you, and where it lives instead.
          Worth saying plainly: from a visitor's point of view these are one
          product, and "which domain am I on" is our problem, not theirs. */}
      <p className="mt-10 flex items-center gap-2 text-[13px] text-faint">
        <Icon name="lock" size={14} />
        Looking for your dashboard or your licence? Those are on the app — use Log in above.
      </p>
    </Container>
  )
}
