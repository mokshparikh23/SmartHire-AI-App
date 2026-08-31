import { Container, Button, Badge } from 'smarthire-ui'
import Icon from 'smarthire-ui/Icon'
import { SIGNUP, LOGIN } from '@/lib/app-links'

/*
  COPY RULES: see the banner at the top of app/layout.js — no impersonation,
  no concealment, no latency figure.

  SPLIT 2026-09-01: A PLACEHOLDER, and it is meant to be replaced.

  The real landing page is apps/web/app/page.jsx — 872 lines of hero, ticker,
  seven numbered sections, an FAQ and a closing card — and it moves here as part
  of the multi-page split, broken across /, /how-it-works, /features and
  /pricing. None of its components have arrived yet.

  What this file is for right now is one check, and it is the check that
  validates the whole font answer in app/layout.js: if the headline below
  renders in Inter Tight rather than in Times, then next/font is emitting
  --font-inter-tight, packages/ui's @theme is reading it, the two are not
  colliding, and @source has carried the package's utility classes into this
  app's CSS. If it renders in a serif, stop and read the font contract at the
  top of packages/ui/src/styles/base.css before going further.
*/
export default function HomePage() {
  return (
    <div className="min-h-screen bg-paper">
      <Container className="flex min-h-screen flex-col justify-center py-24">
        <Badge tone="accent" className="mb-7 self-start">
          <Icon name="sparkle" size={12} />
          For the person answering the questions
        </Badge>

        <h1 className="hl text-[clamp(2.1rem,4.6vw,3.6rem)] text-ink">
          Know the answer as they ask it.
        </h1>

        <p className="mt-8 max-w-xl text-[17px] leading-relaxed text-muted">
          A copilot for the interview you are sitting in. It hears the question and
          puts the answer on screen while it is still being asked — pulled from your
          own CV, tagged where each fact came from, and short enough to read without
          losing the thread of what you were saying.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Button href={SIGNUP} size="lg" iconRight="arrowRight">Get started</Button>
          <Button href={LOGIN} variant="secondary" size="lg">Log in</Button>
        </div>

        <p className="eyebrow mt-16">
          Placeholder — the real page arrives with the marketing components
        </p>
      </Container>
    </div>
  )
}
