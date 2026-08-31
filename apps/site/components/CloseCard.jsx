import Icon from 'smarthire-ui/Icon'
import { Container, Button } from 'smarthire-ui'
import { LOGIN, SIGNUP } from '@/lib/app-links'

/*
  COPY RULES: see the banner at the top of app/layout.js — no impersonation,
  no concealment, no latency figure.

  SPLIT 2026-09-01: the dark closing panel from the bottom of
  apps/web/app/page.jsx, extracted because four routes end with it now.

  A component with overridable copy rather than four pasted copies: the panel is
  the last thing on every page and the one that has to look identical
  everywhere, and the two lines of text are the only part that should differ.
  Each page passes copy that follows from what the reader just read — the
  default below is the landing page's, which is the general case.

  Both buttons leave for the app on app.<domain>. Button already sends an https?
  href down the plain-anchor path (see the note above `external` in
  packages/ui/src/index.jsx), so this needs nothing special; the "I already have
  one" link is a bare <a> for the same reason.
*/
export default function CloseCard({
  // PIVOT 2026-08-29: the lede was "Set it up in the time it takes to read the
  // job description again." — the candidate's job description.
  title = 'Your next interview is already scheduled.',
  lede = 'Ten free minutes on signup. Enough to run a real one and decide.',
}) {
  return (
    <section className="py-24 sm:py-32">
      <Container>
        <div className="relative overflow-hidden rounded-2xl bg-ink px-8 py-20 text-center sm:px-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-1/3 h-full"
            style={{
              background:
                'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.1), transparent 62%)',
            }}
          />
          <div className="relative">
            <h2 className="hl mx-auto max-w-[19ch] text-[clamp(1.9rem,3.4vw,2.75rem)] text-paper">
              {title}
            </h2>
            <p className="mx-auto mt-6 max-w-md text-[16px] leading-relaxed text-paper/60">
              {lede}
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              {/* <Button href="/signup" size="lg" className="bg-paper text-ink hover:bg-canvas-2"> */}
              <Button href={SIGNUP} size="lg" variant="inverse">
                Create your account
              </Button>
              <a
                href={LOGIN}
                className="border-b border-paper/25 pb-0.5 text-[15px] font-medium text-paper/75 transition-colors hover:border-paper hover:text-paper"
              >
                I already have one
              </a>
            </div>

            <div className="mt-14 flex flex-wrap items-center justify-center gap-10 border-t border-paper/10 pt-9 text-[14px] text-paper/50">
              <span className="flex items-center gap-2.5"><Icon name="apple" size={16} /> macOS</span>
              <span className="flex items-center gap-2.5"><Icon name="windows" size={16} /> Windows</span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
