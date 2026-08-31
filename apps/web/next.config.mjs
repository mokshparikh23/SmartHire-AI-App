/** @type {import('next').NextConfig} */
const nextConfig = {
  /* The dev-tools indicator renders bottom-left, where it sits on top of the
     account menu. Hidden entirely — compile and runtime errors still surface. */
  devIndicators: false,

  experimental: {
    optimizePackageImports: ['@supabase/supabase-js', '@supabase/ssr']
  },

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
  transpilePackages: ['smarthire-ui', 'smarthire-pricing'],

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
