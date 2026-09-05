import { Inter_Tight, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

/*
  ADMIN SPLIT 2026-09-01 ─ THE TWO DECLARATIONS BELOW ARE COPIED VERBATIM FROM
  apps/dashboard/app/layout.js, AND THEY CANNOT BE FACTORED OUT. Do not "fix" this.

  next/font/google is parsed by SWC at the call site. It rejects spreads and
  imported identifiers, so the options object cannot come from a shared module
  and a root layout cannot come from a package. Three apps, three copies, and the
  contract between them is the two variable names — nothing else.

  THE CONTRACT: emit --font-inter-tight and --font-mono-plex, and never reuse a
  name that packages/ui/src/styles/base.css defines in its @theme block. That
  file has `--font-tight: var(--font-inter-tight, …)`; naming this one
  --font-tight too would make that declaration reference itself, which is invalid
  at computed-value time, and the whole app renders in Times. apps/dashboard's layout
  carries the long version of this story — read it before touching either name.

  Also deliberately NOT passing `fallback: [...]`. It replaces next/font's
  auto-generated metric-matched face (the "Inter Tight Fallback" @font-face built
  on local(Arial) with ascent-override and size-adjust) with a plain generic
  stack, which makes the swap under `display: swap` worse rather than better. The
  generic stack lives in base.css as a var() fallback instead. Verify after a
  build: computed --font-inter-tight on <html> must read
  `"Inter Tight", "Inter Tight Fallback"` — the second name is the proof.
*/
const tight = Inter_Tight({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-inter-tight',
  display: 'swap',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono-plex',
  display: 'swap',
})

export const metadata = {
  title: 'Admin — Smart Hire AI',

  /*
    ADMIN SPLIT 2026-09-01: one of three layers, and this is the weakest of them.

    Metadata only exists on pages that render a <head>, so it misses the /api
    routes entirely. The X-Robots-Tag header in next.config.mjs covers those, and
    app/robots.js goes further still and disallows crawling outright — which is
    the opposite of what apps/dashboard does, for reasons written down in that file.
  */
  robots: { index: false, follow: false },

  /* No description, no openGraph, no metadataBase. There is no audience for a
     preview card of a page nobody without an admin role can open, and a
     metadataBase would only exist to build absolute URLs for tags this app does
     not emit. */
}

export default function RootLayout({ children }) {
  /* data-scroll-behavior because base.css sets `scroll-behavior: smooth`, and
     without the attribute Next warns on every client navigation — a smooth
     scroll during a route change animates from the OLD page's scroll position.
     Same reason as apps/dashboard. */
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${tight.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
