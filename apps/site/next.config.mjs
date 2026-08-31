/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Same reason as apps/web: the dev-tools indicator renders bottom-left and
     sits on top of page content. Compile and runtime errors still surface. */
  devIndicators: false,

  /* SPLIT 2026-09-01: the same backstop apps/web carries, for the same reason.
     `next dev` blocks /_next/static from any host but localhost, so opening
     this site at 127.0.0.1:3002 would serve HTML with no JavaScript — every
     nav link still works, but the mobile menu and the Desi Mode tabs would
     silently do nothing. Ignored outside `next dev`. */
  allowedDevOrigins: ['127.0.0.1', 'localhost'],

  /* SPLIT 2026-09-01 ────────────────────────────────────────────────────────
     Both shared packages ship RAW source — plain ESM in smarthire-pricing, JSX
     in smarthire-ui — with no build step. There is nothing in this repo to run
     one, and pre-bundling is the standard way a 'use client' directive gets
     lost in transit.

     Next 16's docs say Turbopack transpiles npm-workspace packages
     automatically, so this is probably redundant. Listed anyway so the
     behaviour does not depend on which bundler runs, and so there is a line to
     point at if JSX inside node_modules ever fails to parse.

     Nothing here may also appear in serverExternalPackages — Next throws at
     build start if a package is in both. This app has none. */
  transpilePackages: ['smarthire-ui', 'smarthire-pricing'],

  /* SPLIT 2026-09-01 ─ app paths that land here go to the app.

     This is the mirror of the two redirects in apps/web/next.config.mjs, and it
     covers the mistake people actually make. Nobody mistypes /how-it-works;
     they arrive at /dashboard or /login on THIS origin — from a bookmark made
     before the split, from editing the port in the address bar, or from any
     link written when there was one deployment. Without this they get a 404 on
     a marketing site, which is a confusing place to be told your dashboard does
     not exist.

     TEMPORARY, NOT PERMANENT, AND NOT NEGOTIABLE. These paths genuinely do not
     belong to this origin, and a 308 would have browsers cache the jump
     forever — the same one-way door that had to be undone in apps/web on the
     day it was introduced.

     Only the paths the app really owns are listed. A blanket rule would send
     every typo to the app and turn its 404 into this site's 404. */
  async redirects() {
    const app = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
    return [
      { source: '/login',           destination: `${app}/login`,     permanent: false },
      { source: '/signup',          destination: `${app}/signup`,    permanent: false },
      { source: '/dashboard',       destination: `${app}/dashboard`, permanent: false },
      { source: '/dashboard/:path*', destination: `${app}/dashboard/:path*`, permanent: false },
      { source: '/admin/:path*',    destination: `${app}/admin/:path*`, permanent: false },
    ]
  },
}

export default nextConfig
