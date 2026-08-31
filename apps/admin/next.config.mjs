/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Same reasoning as apps/web: the indicator renders bottom-left, on top of the
     sidebar's account block. Compile and runtime errors still surface. */
  devIndicators: false,

  /* Matching apps/web, so the two admin-adjacent apps agree. */
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js', '@supabase/ssr']
  },

  /* ADMIN SPLIT 2026-09-01 ─ DEV ONLY, AND IT PREVENTS A SILENT SIGN-IN FAILURE.

     Copied deliberately rather than by habit, because this app is the one where
     the failure it prevents is worst. `next dev` serves on localhost and blocks
     /_next/static requests from any other host, so reaching this app at
     127.0.0.1:3003 returns the HTML and none of the JavaScript. React never
     hydrates, the sign-in form's onSubmit never runs, and the browser falls back
     to a NATIVE submit:

         GET /login?email=...&password=...

     Nothing navigates, so it reads as a dead button — and an admin password is
     left in the URL bar, the history and this server's log. That is how it was
     found on apps/web. See the note in apps/web/next.config.mjs.

     This app has exactly one form and it is the admin sign-in, so the backstop
     matters more here than there. */
  allowedDevOrigins: ['127.0.0.1', 'localhost'],

  /* The shared workspace packages ship RAW source and are not pre-bundled — see
     the longer note in apps/web/next.config.mjs for why there is no build step
     and why pre-bundling is the standard way to lose a 'use client' directive.

     smarthire-data joins this list when it exists (Phase 1 of the split).
     Nothing here may also appear in serverExternalPackages; Next throws at build
     start if a package is in both. */
  transpilePackages: ['smarthire-ui', 'smarthire-pricing'],

  async headers() {
    return [{
      source: '/:path*',
      headers: [
        /* Belt and braces with the `robots` metadata in app/layout.js. Sent as a
           header as well because metadata only exists on pages that render a
           <head> — it would miss every /api route. */
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },

        /* ADMIN SPLIT 2026-09-01 ─ three headers apps/web does not have, and the
           asymmetry is deliberate.

           Clickjacking "Remove admin" or "Comp a yearly subscription" is worth
           strictly more than clickjacking a dashboard, and this is the only
           origin in the repo with no third-party embeds of any kind, so framing
           can be denied outright at zero cost. X-Frame-Options is the legacy
           spelling and frame-ancestors is the one that actually governs; both
           are sent because the cost is a header.

           Referrer-Policy is not boilerplate either: admin URLs carry user ids,
           and same-origin stops one leaking in a Referer to anything an admin
           clicks through to. */
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        { key: 'Referrer-Policy', value: 'same-origin' },
      ],
    }]
  },
}

export default nextConfig
