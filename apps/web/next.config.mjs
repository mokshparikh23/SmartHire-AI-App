/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js', '@supabase/ssr']
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
