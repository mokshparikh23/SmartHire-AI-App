/** @type {import('next').NextConfig} */
const nextConfig = {
  /* The dev-tools indicator renders bottom-left, where it sits on top of the
     account menu. Hidden entirely — compile and runtime errors still surface. */
  devIndicators: false,

  experimental: {
    optimizePackageImports: ['@supabase/supabase-js', '@supabase/ssr']
  },

  /* SPLIT 2026-09-01 ─ DEV ONLY, AND IT PREVENTS A SILENT SIGN-IN FAILURE.

     `next dev` serves on localhost and blocks /_next/static requests from any
     other host. Reaching this app at 127.0.0.1:3000 therefore returns the HTML
     and none of the JavaScript, React never hydrates, and AuthForm's onSubmit
     never runs — so the sign-in form falls back to a NATIVE submit:

         GET /login?email=...&password=...

     Nothing navigates, so it reads as a dead button, and the password is left
     in the URL bar, the history and this server's log. That is how it was found.

     The real fix is that browser-facing links use localhost (see
     apps/marketing/lib/app-links.js). This is the backstop for anyone who types the
     IP anyway, and it costs nothing: the option is ignored outside `next dev`.

     apps/desktop is unaffected either way — it calls /api/* from Node, which
     does not fetch these chunks, and it must keep using 127.0.0.1. */
  allowedDevOrigins: ['127.0.0.1', 'localhost'],

  /* SPLIT 2026-09-01 ────────────────────────────────────────────────────────
     The shared workspace packages ship RAW source — plain ESM, and JSX once
     packages/ui lands. There is no build step for them and there should not be:
     nothing in this repo orchestrates one, and pre-bundling is the standard way
     to lose a 'use client' directive on the way through.

     Next 16's own docs say Turbopack transpiles npm-workspace packages
     automatically under both routers, so this is probably redundant today. It
     is listed anyway, for two reasons: the behaviour should not depend on which
     bundler happens to run, and when a "unexpected token" on JSX inside
     node_modules eventually appears, this is the line to point at.

     Nothing here may also appear in serverExternalPackages below — Next throws
     at build start if a package is in both. There is no overlap with unpdf. */
  transpilePackages: ['@smarthire/ui', '@smarthire/pricing', '@smarthire/data'],

  /* SPLIT 2026-09-01 ────────────────────────────────────────────────────────
     `/` and `/compare` are served by apps/marketing on the marketing domain now.

     308 AND NOT 404. Both had inbound links and bookmarks — the sign-in page's
     logo pointed at `/`, and anyone who bookmarked the old *.vercel.app host
     lands there. A permanent redirect also consolidates whatever ranking those
     two URLs accumulated onto the new domain instead of throwing it away.

     For that consolidation to actually happen, Google has to be ALLOWED to
     crawl these paths and see the 308. That is why app/robots.js below permits
     crawling and the noindex is sent as a header instead — a Disallow here
     would mean the redirects are never fetched and both copies stay indexed.
     Revisit in 4–6 weeks once Search Console shows the moves picked up.

     proxy.js needs no change: its matcher never covered `/` or `/compare`. */
  async redirects() {
    const configured = process.env.NEXT_PUBLIC_WWW_URL?.replace(/\/$/, '')

    /*
      FIXED 2026-09-01, same day it was introduced. The first version of this
      block read:

        const site = (process.env.NEXT_PUBLIC_WWW_URL || 'https://smarthire.ai')

      — a hardcoded fallback to a domain nobody owns yet, served as a 308.

      A 308 IS A ONE-WAY DOOR. Browsers cache permanent redirects indefinitely
      and without needing a Cache-Control header, so one visit to
      localhost:3000/ was enough to make that browser jump straight to a dead
      hostname forever, without asking this server again. Fixing the config does
      not undo it; the person has to clear their cache. Which is exactly how it
      was found — "I clicked log in and nothing happened".

      Two rules come out of that, and neither should be relaxed:

      1. NEVER REDIRECT TO A GUESSED DESTINATION. If the marketing origin is not
         configured, there is no correct target. In development, send `/` to the
         local site so it still works; in a real build with nothing configured,
         emit no redirect at all and let `/` 404 — this app genuinely has no `/`
         page, so a 404 is the honest answer and it is recoverable.

      2. PERMANENT ONLY ONCE THE DOMAIN IS REAL. `permanent` is gated on the
         variable actually being set AND a production build. Until then it is a
         307, which browsers re-check every time.
    */
    const site = configured
      || (process.env.NODE_ENV === 'development' ? 'http://localhost:3002' : null)

    if (!site) return []

    const permanent = Boolean(configured) && process.env.NODE_ENV === 'production'

    return [
      { source: '/',        destination: `${site}/`,        permanent },
      { source: '/compare', destination: `${site}/compare`, permanent },
    ]
  },

  /* SPLIT 2026-09-01: nothing on this deployment belongs in a search index.

     Sent as a HEADER rather than only as metadata, because metadata only exists
     on pages that render a <head> — it would miss all 23 /api routes and both
     redirects above. The metadata in app/layout.js is the belt; this is the
     braces. */
  async headers() {
    return [{
      source: '/:path*',
      headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
    }]
  },

  /* RESUME-UPLOAD 2026-08-30 ──────────────────────────────────────────────────
     unpdf is left to Node at runtime instead of being traced by the bundler.

     Two reasons it cannot be bundled. It resolves its engine lazily —
     `await import("unpdf/pdfjs")`, a ~1.6 MB file the bundler has no reason to
     follow — and it optionally reaches for @napi-rs/canvas, a native module that
     is not installed here and never will be, because /api/resume/parse only ever
     extracts text and never rasterises a page.

     Getting this wrong fails at RUNTIME ONLY: the build succeeds, and the route
     500s on the first upload against a deploy preview. Worth exercising there
     rather than trusting `next dev`, which resolves from the real node_modules
     and so cannot reproduce it. */
  serverExternalPackages: ['unpdf']
}

export default nextConfig
