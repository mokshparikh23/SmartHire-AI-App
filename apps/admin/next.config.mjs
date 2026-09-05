/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Same reasoning as apps/dashboard: the indicator renders bottom-left, on top of the
     sidebar's account block. Compile and runtime errors still surface. */
  devIndicators: false,

  experimental: {
    /* Matching apps/dashboard, so the two admin-adjacent apps agree. */
    optimizePackageImports: ['@supabase/supabase-js', '@supabase/ssr'],

    /* ADMIN SPLIT 2026-09-01 ─ REQUIRED BY app/forbidden.jsx. DO NOT DROP IT.

       forbidden() from next/navigation throws unless this is on
       (node_modules/next/dist/client/components/forbidden.js:25). The failure of
       removing it is NOT a build error at the call site: forbidden() throws a
       plain E488 Error at RUNTIME, inside requireAdminPage(), on the deny path
       only — and the deny path is by definition the one nobody exercises. So a
       future tidy-up of this block would turn every non-admin's 403 into an
       error page, and nothing would notice until someone was turned away.

       The drill that catches it: sign in as a non-admin and expect a 403 page,
       not error.jsx. */
    authInterrupts: true,
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
     found on apps/dashboard. See the note in apps/dashboard/next.config.mjs.

     This app has exactly one form and it is the admin sign-in, so the backstop
     matters more here than there. */
  allowedDevOrigins: ['127.0.0.1', 'localhost'],

  /* The shared workspace packages ship RAW source and are not pre-bundled — see
     the longer note in apps/dashboard/next.config.mjs for why there is no build step
     and why pre-bundling is the standard way to lose a 'use client' directive.

     @smarthire/data joins this list when it exists (Phase 1 of the split).
     Nothing here may also appear in serverExternalPackages; Next throws at build
     start if a package is in both. */
  transpilePackages: ['@smarthire/ui', '@smarthire/pricing'],

  /* ADMIN SPLIT 2026-09-01 ─ the bare hostname is not a page.

     The console kept its /admin path prefix when it moved here, so
     admin.<domain>/admin/users is the real URL and admin.<domain>/ has nothing
     to render. Keeping the prefix is what made the move a pure rename: the four
     NAV entries in AdminSidebar, the logo link, the two panel headers and the
     two quick-action cards in app/admin/page.jsx are all still correct
     unchanged, and so are the five fetch('/api/admin/…') strings in the client
     components — which shrank the most dangerous diff in this split to file
     moves plus one link.

     SAME-ORIGIN, so this is not a guessed destination and needs no env var.

     permanent: false, because flattening /admin/* to /* here is a plausible
     future change and a 308 would outlive it in every browser cache that ever
     saw it. This repo has already had to undo one such redirect. */
  async redirects() {
    return [
      { source: '/', destination: '/admin', permanent: false },
    ]
  },

  async headers() {
    return [{
      source: '/:path*',
      headers: [
        /* Belt and braces with the `robots` metadata in app/layout.js. Sent as a
           header as well because metadata only exists on pages that render a
           <head> — it would miss every /api route. */
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },

        /* ADMIN SPLIT 2026-09-01 ─ three headers apps/dashboard does not have, and the
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
