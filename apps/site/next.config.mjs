/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Same reason as apps/web: the dev-tools indicator renders bottom-left and
     sits on top of page content. Compile and runtime errors still surface. */
  devIndicators: false,

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
}

export default nextConfig
