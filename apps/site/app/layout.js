import { Inter_Tight, IBM_Plex_Mono } from 'next/font/google'
import { SiteNav, SiteFooter } from '@/components/SiteChrome'
import { ScrollProgress } from '@/components/Reveal'
import './globals.css'

/*
  ══════════════════════════════════════════════════════════════════════════════
  WHAT THIS SITE WILL NOT SAY

  SPLIT 2026-09-01: the two blocks below were the banner at the top of
  apps/web/app/page.jsx, back when the marketing site was one file. They are not
  page copy — they are the standing rules for every page here, and leaving them
  on the landing page would have shipped four of five routes with no record of
  the two claims that are permanently out.

  TWO THINGS STAY OUT, and they are not stylistic preferences — the shipped
  prompt refuses both, so putting them here would make this site a claim about
  software that does not exist (which is exactly how the landing page went wrong
  on 2026-08-29; see the note at the top of systemPrompt.js):

    1. IMPERSONATION. Nothing here says the app speaks for you, writes in your
       voice, or produces a line to read out as your own. answerPrompt() answers
       the question; styleBlock() closes with "never hide or deny what you are.
       Asked directly, say plainly that you are an AI assistant."

    2. CONCEALMENT. This site says nothing about whether the panel appears in a
       screen share, in a recording, or to anyone else in the call. The window
       flags in electron/main.cjs are what they are; a marketing promise about
       window compositing is a different thing, it was removed from the page
       once already, and it does not come back.

  AND NO LATENCY FIGURE. The reference design this was built from carried a
  "4 seconds" promise throughout. Nobody has measured this app, so the stages
  are named and the numbers are left out — an invented latency is the easiest
  claim on a page like this to be caught on.

  ──────────────────────────────────────────────────────────────────────────────
  CONCEPT 2026-08-30 ─ THIS SITE IS THE CANDIDATE'S.

  The product decision, taken by the owner: the left pane of the product frame
  is the question the INTERVIEWER asked, and the right pane is the answer. The
  reader is the person being interviewed. Every section was written for the
  interviewer until that date and was turned around; the interviewer-side copy
  is kept in comments beside each block, per the convention in this repo.

  On screen capture specifically: the desktop app does call
  setContentProtection(true), so the panel is kept out of a screen share. This
  site makes no promise either way — not that it is hidden, and not that it is
  visible. What the window manager does is one thing; a marketing claim about it
  is another, and the two entries that once made one ("Invisible on screen", and
  the first line of the old FAQ) are why that file spent three days being
  corrected.

  Every page file and every content/*.js module opens with a one-line pointer
  back here. Read this before writing copy.
  ══════════════════════════════════════════════════════════════════════════════
*/

/*
  ── FONTS ─────────────────────────────────────────────────────────────────────

  SPLIT 2026-09-01: these two declarations are a VERBATIM DUPLICATE of the ones
  in apps/web/app/layout.js, and they have to be.

  THE OBVIOUS REFACTOR DOES NOT WORK. Exporting the option objects from
  packages/ui and spreading them at each call site fails the build:
  next/font/google is compiled by Next's SWC font loader, which statically
  parses the CALL SITE and rejects spreads and imported identifiers with "Font
  loader values must be explicitly written literals". A root layout must also
  live at app/layout.js in each app — it cannot come from a package.

  There is nothing to gain either. next/font self-hosts: each app writes its own
  woff2 into its own .next/static/media and serves it from its own domain, so
  two deployments could not share the asset even if the code were shared.

  WHAT IS SHARED IS THE CONTRACT, and it lives in
  packages/ui/src/styles/base.css:

      --font-sans / --font-display / --font-tight  read  --font-inter-tight
      --font-mono                                  reads --font-mono-plex

  So this file MUST emit exactly those two variable names, and MUST NOT emit any
  of the four the @theme block defines. next/font writes its variable from an
  UNLAYERED class on <html>; @theme writes into @layer theme; unlayered always
  wins. Name them the same and the @theme declaration references itself the
  moment the className is absent — invalid at computed-value time, and the whole
  site renders in Times. That failure is documented at length in
  apps/web/app/layout.js and in the @theme block itself.
*/

/*
  Deliberately NOT passing `fallback: [...]`.

  Doing so replaces next/font's auto-generated metric-matched face — the
  "Inter Tight Fallback" @font-face built on local(Arial) with ascent-override,
  descent-override and size-adjust — with a plain generic stack. That face is
  what stops text reflowing when the webfont lands under `display: swap`, so
  trading it for a generic stack makes the visible swap WORSE, which is the
  opposite of the goal. Verified by building both ways.

  The generic stack lives in base.css as a var() FALLBACK instead —
  `var(--font-inter-tight, ui-sans-serif, …)` — which only applies if the
  variable is missing entirely.
*/
// No `weight` on purpose: Inter Tight ships a variable font with an fvar table,
// so omitting it gives the whole 100–900 range in one file. The site uses
// 400 through 600. `style` includes italic because .display-italic is defined in
// the shared base.css; dropping it would silently synthesise an oblique.
const tight = Inter_Tight({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-inter-tight',
  display: 'swap',
})

// Two weights only. 400 for figures and timers, 500 for eyebrows and markers —
// the reference never goes heavier, and each extra weight is another file. 600
// would be faux-bolded by the browser at 11px in .eyebrow, which looks smudged.
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono-plex',
  display: 'swap',
})

/*
  metadataBase is required for relative `alternates.canonical` and relative
  openGraph image paths to resolve to absolute URLs. Without it Next falls back
  to the deployment's own hostname, which on a preview means preview URLs leak
  into production OG tags.
*/
export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3001'),
  title: {
    default: 'Smart Hire AI — Interview Copilot',
    /*
      Pages set a short `title` and this appends the brand. NOTE for whoever
      moves /compare here: its existing title already ends in "— Smart Hire AI"
      and will double under this template. Shorten it to "Compare AI interview
      assistants" when it lands.
    */
    template: '%s — Smart Hire AI',
  },
  /*
    PIVOT 2026-08-29: was "Real-time answers during live interviews. Invisible to
    your interviewer."

    CONCEPT 2026-08-30: the product is the candidate's again, so the first half of
    that old string is back — real-time answers during live interviews. The second
    half is NOT, and does not come back: this description makes no claim about who
    can or cannot see the panel. That was a promise about window compositing, it
    was removed once already, and the site is deliberately silent on it. See the
    banner at the top of this file.

    The interviewer-side description this replaced:
    'A copilot for the person running the interview. It listens with the candidate’s
     knowledge and consent, and suggests what to ask next.'
  */
  description:
    'Real-time answers during live interviews. It hears the question, and puts the ' +
    'answer on screen — drawn from your own CV and tagged where each fact came from.',
  alternates: { canonical: '/' },
  openGraph: { type: 'website', siteName: 'Smart Hire AI', locale: 'en_IN' },
  twitter: { card: 'summary_large_image' },
}

/*
  ── THE CHROME LIVES HERE, NOT IN EACH PAGE ───────────────────────────────────

  SPLIT 2026-09-01: on apps/web, `/` and `/compare` each rendered
  <ScrollProgress/>, <SiteNav/>, <main> and <SiteFooter/> themselves. With five
  routes that would be five copies of the same twelve lines — but the real cost
  is that SiteNav would REMOUNT on every navigation, throwing away its scroll
  listener and its gesture anchor each time.

  Rendering it once here is also what makes the active-route underline possible:
  the component survives the navigation and reads usePathname. The one thing it
  has to do in exchange is reset itself on a route change, since it no longer
  gets a fresh mount — there is a useEffect in SiteNav that does exactly that.

  Page files return section content only.
*/
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${tight.variable} ${mono.variable}`}>
      <head>
        {/*
          SPLIT 2026-09-01: `.reveal { opacity: 0 }` means everything below the
          hero is invisible until the IntersectionObserver runs. That was already
          true of one long page; across five short routes it is most of the
          document, and without JS the site is close to blank.

          Not a crawler problem — the HTML is all there, and opacity is not
          cloaking — but a real one for anyone with JS off or blocked. Three
          lines in a <noscript> is the whole fix.
        */}
        <noscript>
          <style>{'.reveal,.reveal .stagger{opacity:1!important;transform:none!important}'}</style>
        </noscript>
      </head>
      <body>
        <div className="min-h-screen bg-paper">
          <ScrollProgress />
          <SiteNav />
          <main>{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  )
}
