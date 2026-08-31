import { headers } from 'next/headers'
import Link from 'next/link'
import Icon from 'smarthire-ui/Icon'
import { Container, Button, Badge } from 'smarthire-ui'
import Reveal from '@/components/Reveal'
import SectionMark from '@/components/SectionMark'
import Ticker from '@/components/Ticker'
import LiveDemo from '@/components/LiveDemo'
import CloseCard from '@/components/CloseCard'
import LegacyHash from '@/components/LegacyHash'
import { TABS } from '@/content/desi-mode'
import { STEPS } from '@/content/steps'
import { homeFeatures } from '@/content/features'
import { SIGNUP } from '@/lib/app-links'
import { resolveCurrency, singlePackForCurrency } from 'smarthire-pricing'

/*
  COPY RULES: see the banner at the top of app/layout.js — no impersonation,
  no concealment, no latency figure.

  SPLIT 2026-09-01 ─ WHAT THIS PAGE IS NOW.

  It was 872 lines: hero, ticker, seven numbered sections, an FAQ and a closing
  card. Four of those sections moved to routes of their own, and what is left
  here is the pitch plus four TEASER bands that hand off to them.

  ONE RULE THROUGHOUT: no section renders on two routes. The teasers below are
  deliberately shorter re-presentations, not copies —

    01  the three step TITLES, and not one word of their bodies
    02  three of six features, named explicitly in content/features.js
    03  the first Desi Mode tab, rendered flat with no tabs and no PROOF row
    04  a price and a sentence; <PricingPlans/> has one home, and it is /pricing

  — so nothing on this page is duplicate content, and nothing here is the last
  word on anything.

  AND THE TEASERS CARRY NO ids. That is not an oversight: LegacyHash maps the
  seven retired anchors (/#how, /#features, /#pricing …) to the routes that now
  own them, and an id on a teaser would compete with that map and land someone
  who bookmarked the pricing table on a four-line summary of it.

  REDESIGN 2026-08-30: the hero below is unchanged from the reference design —
  the animated product frame, the two floating annotation cards, the underline
  stroked on as it settles, and the three-stat row with a real price in it.
*/
export default async function HomePage() {
  /*
    Still dynamic, and deliberately so. resolveCurrency reads the request's geo
    headers, which opts this page out of static rendering — that is the trade for
    showing every visitor the price they will actually be charged. It is the same
    call /api/checkout makes on the other origin, so the page and the charge
    cannot disagree.

    SPLIT 2026-09-01: the block that used to sit here asked Supabase whether the
    visitor was signed in, to decide whether Buy went straight to checkout or via
    signup. This site is on another origin now and is not sent that cookie —
    and rather than widen the auth cookie to the apex domain to get it back, the
    question is simply not asked here. The app answers it on its own origin. See
    lib/app-links.js.

    let signedIn = false
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      signedIn = !!user
    } catch { }
  */
  const currency = resolveCurrency(await headers())
  const single = singlePackForCurrency(currency)

  const sample = TABS[0]

  return (
    <>
      <LegacyHash />

      {/* ═══════════════════════════════════════════════ hero ═════════ */}
      <section className="overflow-hidden border-b border-line-soft">
        <Container wide className="py-16 sm:py-24">
          {/* min-w-0 on the columns: a grid item defaults to min-width:auto,
              so the nowrap phrase in the headline would otherwise force the
              column wider than the viewport and the section's overflow-hidden
              would silently clip the body copy with it. */}
          <div className="grid items-center gap-16 lg:grid-cols-[1.02fr_0.98fr]">
            <div className="min-w-0">
              {/* <Badge …>For the person running the interview</Badge> */}
              <Badge tone="accent" className="mb-7">
                <Icon name="sparkle" size={12} />
                For the person answering the questions
              </Badge>

              {/* <h1 …>Ask the question <span>you would have missed.</span></h1> */}
              <h1 className="hl text-[clamp(2.1rem,4.6vw,3.6rem)] text-ink">
                Know the answer{' '}
                {/* The phrase only refuses to wrap once there is room for it.
                    Below sm it wraps normally and the rule is dropped — an
                    underline stretched across a two-line wrap reads as a
                    rendering fault rather than as emphasis. */}
                {/* KEEP THIS PHRASE SHORT. It is `whitespace-nowrap` above
                    sm, so it cannot wrap — it overflows the grid column
                    instead, and the column's neighbour is the product frame.
                    "while they are still asking." was tried first and ran
                    under the frame at 1280 and below. The original phrase was
                    21 characters; stay at or under that. */}
                <span className="relative whitespace-normal sm:whitespace-nowrap">
                  as they ask it.
                  {/* Hand-drawn rule, stroked on as the hero settles. */}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 300 12"
                    preserveAspectRatio="none"
                    className="u-draw absolute -bottom-[0.16em] left-0 hidden h-[0.24em] w-full overflow-visible sm:block"
                  >
                    <path
                      d="M4 8.4C58 3.6 168 2.4 296 6.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="7"
                      strokeLinecap="round"
                      className="text-ink"
                    />
                  </svg>
                </span>
              </h1>

              {/* <p …>A copilot for the interviewer. It listens to the conversation and
                  tells you what is worth asking next …</p> */}
              <p className="mt-8 max-w-xl text-[17px] leading-relaxed text-muted">
                A copilot for the interview you are sitting in. It hears the question and
                puts the answer on screen while it is still being asked — pulled from your
                own CV, tagged where each fact came from, and short enough to read without
                losing the thread of what you were saying.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Button href={SIGNUP} size="lg" iconRight="arrowRight">Get started</Button>
                {/* SPLIT 2026-09-01: was href="#how", a fragment on this page.
                    It is a route now. */}
                <Button href="/how-it-works" variant="secondary" size="lg">See how it works</Button>
              </div>

              {/* A price above the fold. Visitors who care what this costs go
                  looking for the number first, and leave if they cannot find
                  it before the pricing section. */}
              {/* A grid rather than flex-wrap: at this column width the three
                  items wrapped 2 + 1, which reads as a mistake rather than a
                  row of stats. */}
              <div className="mt-11 grid gap-6 border-t border-line pt-8 sm:grid-cols-3">
                {[
                  ['Ten minutes', 'free on a new account, no card'],
                  [single.price, 'for a single hour, no subscription', true],
                  ['macOS & Windows', 'one licence, either machine'],
                ].map(([big, small, numeric]) => (
                  <div key={small}>
                    <p
                      className="hl text-[19px] text-ink"
                      {...(numeric ? { 'data-numeric': true } : {})}
                    >
                      {big}
                    </p>
                    <p className="mt-1.5 text-[13px] leading-snug text-faint">{small}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* The product frame, running as a loop. */}
            <div className="relative min-w-0">
              <LiveDemo />

              {/* Floating annotations, as in the reference. Hidden on small
                  screens where they would overlap the frame itself.

                  Offsets are set so each card clears the panel's chrome: at
                  -top-7 this one sat over the status bar and hid the
                  "Listening" indicator, which is the part of the frame most
                  worth seeing. Now it grazes the corner and nothing else. */}
              <div className="absolute -left-8 -top-14 hidden items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-3 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.4)] xl:flex">
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-canvas-2 text-ink">
                  <Icon name="mic" size={16} />
                </span>
                <span>
                  {/* <span …>Hears the room</span> */}
                  <span className="block text-[14px] font-medium leading-tight text-ink">
                    Hears the question
                  </span>
                  <span className="mono text-[10px] uppercase tracking-[0.1em] text-faint">
                    Audio → transcript
                  </span>
                </span>
              </div>

              {/* The lower card was "Gated on consent / Enforced in code" —
                  the interviewer's promise about someone else's CV. The
                  document is the reader's own now, so the mark that earns its
                  place is the grounding rule instead. */}
              <div className="absolute -bottom-14 -right-5 hidden items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-3 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.4)] xl:flex">
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-positive-soft text-positive">
                  <Icon name="file" size={16} />
                </span>
                <span>
                  <span className="block text-[14px] font-medium leading-tight text-ink">
                    From your own CV
                  </span>
                  <span className="mono text-[10px] uppercase tracking-[0.1em] text-faint">
                    Tagged inline
                  </span>
                </span>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* ═════════════════════════════════════════════ ticker ═════════ */}
      <Ticker />

      {/* ═══════════════════════════════════ 01 how it works (teaser) ══ */}
      {/* Titles only. STEPS[].body belongs to /how-it-works and appears
          nowhere else. */}
      <Reveal as="section" className="border-b border-line-soft py-24 sm:py-32">
        <Container wide>
          <SectionMark
            no="01"
            label="How it works"
            title="Set it up once. It is ready for every interview after that."
            lede="Three steps, and the first two are done before anyone dials in."
          />

          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.n} className="stagger bg-paper p-8" style={{ '--i': i }}>
                <span className="mono block text-[13px] tracking-[0.14em] text-faint">
                  STEP {step.n}
                </span>
                <h3 className="mt-4 text-[17px] font-semibold text-ink">{step.title}</h3>
              </div>
            ))}
          </div>

          <TeaserLink href="/how-it-works">
            The full sequence, stage by stage
          </TeaserLink>
        </Container>
      </Reveal>

      {/* ═══════════════════════════════════════ 02 features (teaser) ══ */}
      <Reveal as="section" className="border-b border-line-soft bg-canvas py-24 sm:py-32">
        <Container wide>
          <SectionMark
            no="02"
            label="Features"
            title="Built for the moment you are put on the spot."
            lede="Three seconds to read it, and then you have to be talking. Everything below is shaped by that."
          />

          <div className="mt-14 grid gap-4 sm:grid-cols-3">
            {homeFeatures().map((f, i) => (
              <div
                key={f.id}
                className="stagger rounded-2xl border border-line bg-paper p-7 transition-all duration-300 hover:-translate-y-[3px]"
                style={{ '--i': i }}
              >
                <span className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-canvas-2 text-ink">
                  <Icon name={f.icon} size={18} />
                </span>
                <h3 className="text-[16px] font-semibold text-ink">{f.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>

          <TeaserLink href="/features">
            All six, and the list of what it does not do
          </TeaserLink>
        </Container>
      </Reveal>

      {/* ══════════════════════════════════════ 03 desi mode (teaser) ══ */}
      {/*
        One tab, rendered flat — no PillTabs, no PROOF row, no interaction. The
        full card is on /features, and a second interactive copy here would be
        the same component twice with the same content.

        DESI-MODE 2026-08-30 holds in miniature: this is framed as REGISTER and
        nothing else. Not "sounds human, not AI", and not "undetectable" —
        styleBlock() refuses that outright, and a teaser that promised it would
        be selling software that does not exist.
      */}
      <Reveal as="section" className="border-b border-line-soft py-24 sm:py-32">
        <Container wide>
          <SectionMark
            no="03"
            label="Desi Mode"
            title="Answer in the English you actually speak."
            lede="Switch Desi Mode on and the answer comes back plain and direct instead of textbook-formal. Same substance underneath — you just do not have to rewrite it in your head before you say it."
          />

          <div className="mt-14 overflow-hidden rounded-2xl border border-line bg-paper">
            <div className="border-b border-line-soft bg-canvas-2 px-7 py-5">
              <p className="eyebrow mb-2">They asked</p>
              <p className="text-[15px] leading-relaxed text-ink">{sample.heard}</p>
            </div>
            <div className="grid gap-px bg-line sm:grid-cols-2">
              <div className="bg-paper p-7">
                <p className="eyebrow mb-3">Textbook</p>
                <p className="text-[14px] leading-relaxed text-faint">{sample.formal}</p>
              </div>
              <div className="bg-paper p-7">
                <p className="eyebrow mb-3">Desi Mode</p>
                <p className="text-[14px] leading-relaxed text-ink">
                  {sample.desi.map((part, i) =>
                    Array.isArray(part)
                      ? <strong key={i} className="font-semibold text-ink">{part[0]}</strong>
                      : <span key={i}>{part}</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <TeaserLink href="/features#desi">
            See all three, and what it will not do
          </TeaserLink>
        </Container>
      </Reveal>

      {/* ════════════════════════════════════════ 04 pricing (teaser) ══ */}
      {/* A price and a sentence. <PricingPlans/> renders on /pricing and
          nowhere else — it is the thing being decided on, and it should be in
          one place with the FAQ that answers the questions it raises. */}
      <Reveal as="section" className="border-b border-line-soft bg-canvas py-24 sm:py-32">
        <Container wide>
          <SectionMark
            no="04"
            label="Pricing"
            title="Go unlimited, or pay by the hour."
            lede="One credit is one hour of interview time, counted a minute at a time. Use 30 minutes and the other 30 stay in your account."
            center
          />

          <div className="mx-auto mt-12 flex max-w-lg flex-col items-center gap-6 text-center">
            <p className="text-[15px] leading-relaxed text-muted">
              Ten free minutes on every new account, no card. After that,{' '}
              <span className="font-semibold text-ink" data-numeric>{single.price}</span>{' '}
              buys a single hour with nothing to cancel — or a subscription covers
              every interview for the period.
            </p>
            <Button href="/pricing" size="lg" iconRight="arrowRight">See the plans</Button>
          </div>
        </Container>
      </Reveal>

      <CloseCard />
    </>
  )
}

/**
 * The hand-off at the foot of a teaser band.
 *
 * SPLIT 2026-09-01: every teaser needs one and they must look identical —
 * four hand-written variants is how three of them end up with different
 * padding. Local to this file, because this is the only page with teasers.
 */
function TeaserLink({ href, children }) {
  return (
    <div className="mt-10">
      <Link
        href={href}
        className="group inline-flex items-center gap-2 border-b border-line pb-1 text-[14px] font-medium text-ink transition-colors hover:border-ink"
      >
        {children}
        <Icon
          name="arrowRight"
          size={15}
          className="transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </Link>
    </div>
  )
}
