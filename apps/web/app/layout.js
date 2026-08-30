import { Inter_Tight, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

/*
  PIVOT 2026-08-29: the two faces used to declare `variable: '--font-sans'` and
  `variable: '--font-display'` — the SAME names globals.css defines in its
  @theme block. That collision is why the fallback stacks never shipped.

  next/font writes its variable from an UNLAYERED class on <html>:
      .inter_xxx__variable { --font-sans: "Inter", "Inter Fallback" }
  Tailwind's @theme writes into a cascade layer:
      @layer theme { :root { --font-sans: var(--font-sans), ui-sans-serif, … } }
  Unlayered always beats layered, so next/font won and everything after the
  var() in the @theme line was dead code. Worse, the moment the className came
  off <html> the @theme declaration would win, reference itself, and become
  invalid at computed-value time — rendering the whole site in Times.

  Distinct names make that state unreachable. The old declarations:

  // const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
  // const display = Instrument_Serif({
  //   subsets: ['latin'], weight: '400', style: ['normal', 'italic'],
  //   variable: '--font-display', display: 'swap',
  // })
*/

/*
  Deliberately NOT passing `fallback: [...]` here.

  Doing so replaces next/font's auto-generated metric-matched face — the
  `Inter Fallback` @font-face built on local(Arial) with ascent-override,
  descent-override and size-adjust — with a plain generic stack. That face is
  the thing that stops text reflowing when the webfont finishes loading under
  `display: swap`, so trading it for a generic stack makes the visible swap
  WORSE, which is the opposite of the goal.

  Verified by building both ways: with `fallback` the compiled CSS contained
  `--font-inter: "Inter", ui-sans-serif, …` and no Fallback @font-face at all.

  The generic stack instead lives in globals.css as a var() FALLBACK —
  `var(--font-inter, ui-sans-serif, …)` — which only applies if the variable is
  missing entirely, and keeps the metric-matched face when it is present.
*/
/*
  REDESIGN 2026-08-30: the marketing site was rebuilt against a reference design
  set in Inter Tight with IBM Plex Mono for labelling.

  EXTENDED 2026-08-30: the same two faces now cover the whole app — dashboard,
  admin and auth — rather than just the marketing page. Inter and Instrument
  Serif are gone entirely, which is the point: keeping them for the
  authenticated screens meant shipping four families, and the app looked like a
  different product once you logged in.

  Their declarations, for the record:

  // const sans = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
  // const display = Instrument_Serif({
  //   subsets: ['latin'], weight: '400', style: ['normal', 'italic'],
  //   variable: '--font-instrument-serif', display: 'swap',
  // })

  `style` includes italic because .display-italic is still used in the auth
  layout; dropping it there would have silently synthesised an oblique.

  No `weight` is listed on purpose. Inter Tight ships a variable font with an
  fvar table, so omitting it gives the whole 100–900 range in one file — which
  the app needs, since it uses 400 through 600. (Instrument Serif above had to
  pin 400 for the opposite reason: no fvar, single static weight.)
*/
// The variable name must NOT match the @theme token that consumes it. globals.css
// defines `--font-tight: var(--font-inter-tight, …)`; naming this one
// `--font-tight` too would make that declaration reference itself, which is
// invalid at computed-value time — the exact failure the block above documents.
const tight = Inter_Tight({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-inter-tight',
  display: 'swap',
})

// Two weights only. 400 for figures and timers, 500 for eyebrows and markers —
// the reference never goes heavier, and each extra weight is another file.
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono-plex',
  display: 'swap',
})

export const metadata = {
  title: 'Smart Hire AI — Interview Copilot',
  /*
    PIVOT 2026-08-29: was "Real-time answers during live interviews. Invisible to
    your interviewer."

    CORRECTION 2026-08-30: the note that stood here said the content-protection
    call "was deleted in 5d4fa31". It was not — setContentProtection(true) is
    live in electron/main.cjs and is staying, deliberately. The panel is the
    interviewer's own working surface. What changed on 2026-08-30 is the other
    half: systemPrompt.js really is interviewer-side now, so the description
    below is finally true of the binary and not just of this page.
  */
  description:
    'A copilot for the person running the interview. It listens with the candidate’s ' +
    'knowledge and consent, and suggests what to ask next.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${tight.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
