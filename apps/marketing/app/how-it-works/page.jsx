import Link from 'next/link'
import Icon from '@smarthire/ui/Icon'
import { Container, Button, Badge } from '@smarthire/ui'
import Reveal from '@/components/Reveal'
import SectionMark from '@/components/SectionMark'
import FaqAccordion from '@/components/FaqAccordion'
import CloseCard from '@/components/CloseCard'
import { STEPS, STAGES, STAGES_TITLE } from '@/content/steps'
import { GROUNDING, GROUNDING_LEDE } from '@/content/grounding'
import { FAQ_PRODUCT } from '@/content/faqs'
import { SIGNUP } from '@/lib/app-links'

/*
  COPY RULES: see the banner at the top of app/layout.js — no impersonation,
  no concealment, no latency figure.

  SPLIT 2026-09-01: sections 01 (How it works) and 02 (Grounding) of the old
  apps/dashboard/app/page.jsx, plus the three product questions from its FAQ.

  Two things changed on the way, and both are improvements the single page could
  not have:

  1. THE STAGE RAIL IS ITS OWN SECTION. It was buried inside "how it works"
     under a bare mono paragraph, because a subsection could not have a heading.
     That paragraph is its SectionMark title now, and the mono line is retired.

  2. SECTION NUMBERS RESTART AT 01. They were 01 and 02 of seven; here they are
     01, 02 and 03 of three. See the note on SectionMark — page-local numbering
     is what /compare has always done, and a reader landing here should not be
     told about sections that are on another route.

  Why Grounding is here and Limits is on /features: this is a claim about
  MECHANISM — what the prompt does and refuses to do — which is the same
  register as the steps and the rail. Limits is a capability inventory, which
  belongs next to the capabilities.
*/

export const metadata = {
  title: 'How it works',
  description:
    'Three fields before the call, then the answer on screen while the question is ' +
    'still being asked — drawn from the CV and job description you gave it, and ' +
    'tagged where each fact came from.',
  alternates: { canonical: '/how-it-works' },
  openGraph: {
    title: 'How it works — Smart Hire AI',
    description:
      'Set the interview up once, open the panel before you dial in, and read the ' +
      'answer while the question is still being asked.',
    url: '/how-it-works',
  },
}

export default function HowItWorksPage() {
  return (
    <>
      {/* ═══════════════════════════════════════════════ hero ═════════ */}
      <section className="border-b border-line-soft">
        <Container wide className="py-16 sm:py-24">
          <div className="max-w-3xl">
            <Badge tone="accent" className="mb-7">
              <Icon name="sparkle" size={12} />
              How it works
            </Badge>

            <h1 className="hl text-[clamp(2rem,4.2vw,3.2rem)] text-ink">
              Three fields before the call. The answer on screen during it.
            </h1>

            <p className="mt-8 max-w-xl text-[17px] leading-relaxed text-muted">
              Set the interview up once, open the panel before you dial in, and read the
              answer while the question is still being asked. It draws on the CV and the
              job description you gave it, and it says so plainly when there is nothing
              behind an answer.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button href={SIGNUP} size="lg" iconRight="arrowRight">Get started</Button>
              <Button href="/pricing" variant="secondary" size="lg">See what it costs</Button>
            </div>
          </div>
        </Container>
      </section>

      {/* ══════════════════════════════════════════ 01 the steps ══════ */}
      <Reveal as="section" className="border-b border-line-soft py-24 sm:py-32">
        <Container wide>
          <SectionMark
            no="01"
            label="Setup"
            title="Set it up once. It is ready for every interview after that."
            lede="Three steps, and the first two are done before anyone dials in."
          />

          <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.n} className="stagger bg-paper p-8" style={{ '--i': i }}>
                <span className="mono block border-b border-line pb-5 text-[13px] tracking-[0.14em] text-ink">
                  STEP {step.n}
                </span>
                <h3 className="mt-5 text-[17px] font-semibold text-ink">{step.title}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Reveal>

      {/* ═════════════════════════════════════════ 02 stage rail ══════ */}
      {/*
        The rail carries no timings on purpose. The reference design put
        0.0s / 0.3s / 0.9s / 4.0s against these four as the headline promise of
        the whole page; nobody has measured this app, so the stages are named and
        the numbers are left out. An invented latency is the easiest claim on a
        page like this to be caught on.

        SPLIT 2026-09-01: promoted out of section 01, where its only heading was
        the mono line that is now this SectionMark's title.
        <p className="mono text-[13px] uppercase tracking-[0.2em] text-faint">
          What happens between them asking and you answering
        </p>
      */}
      <Reveal as="section" className="border-b border-line-soft bg-canvas py-24 sm:py-32">
        <Container wide>
          <SectionMark no="02" label="In the moment" title={STAGES_TITLE} />

          <div className="relative mt-16">
            {/* The track and its fill sit behind the dots. Hidden below the
                breakpoint where the four stages stack vertically. */}
            <span
              aria-hidden="true"
              className="absolute left-0 right-0 top-[7px] hidden h-px bg-line sm:block"
            />
            <span
              aria-hidden="true"
              className="rail-fill absolute left-0 top-[7px] hidden h-px bg-ink sm:block"
            />

            <div className="relative grid gap-10 sm:grid-cols-4">
              {STAGES.map(([title, body], i) => (
                <div
                  key={title}
                  className="stagger max-sm:border-l max-sm:border-line max-sm:pl-5"
                  style={{ '--i': i }}
                >
                  <span
                    aria-hidden="true"
                    className="relative z-10 hidden h-[15px] w-[15px] rounded-full border-2 border-ink bg-paper sm:block"
                  />
                  <p className="mono mt-5 text-[13px] uppercase tracking-[0.12em] text-faint max-sm:mt-0">
                    Stage {i + 1}
                  </p>
                  <h3 className="mt-1.5 text-[15px] font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Reveal>

      {/* ═════════════════════════════════════════ 03 grounding ═══════ */}
      {/*
        CONCEPT 2026-08-30: this was the Consent section — the interviewer's
        promise about a CV that belonged to someone else. The document is the
        reader's own now, so that argument does not transfer and pretending it
        does would be the emptiest section on the site.

        What replaces it is the property that matters when the answer is going to
        come out of your mouth: it answers from your CV or it admits it does not
        know. Every one of the four is checked against
        apps/desktop/src/services/systemPrompt.js — see content/grounding.js.

        The id changed with it (#consent → #grounded). SiteChrome's footer links
        to it and LegacyHash maps the old fragment; all three moved together.
      */}
      <Reveal as="section" id="grounded" className="scroll-mt-24 border-b border-line-soft py-24 sm:py-32">
        <Container wide>
          <div className="grid gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
            <div>
              <SectionMark
                no="03"
                label="Grounding"
                title="It answers from your CV, or it says it does not know."
              />
              {GROUNDING_LEDE.map((line, i) => (
                <p
                  key={i}
                  className={`${i === 0 ? 'mt-6' : 'mt-4'} max-w-md text-[15px] leading-relaxed text-muted`}
                >
                  {line}
                </p>
              ))}

              {/* SPLIT 2026-09-01: the one link that keeps the two honesty
                  arguments a click apart now that they are on different routes.
                  Grounding says what it will do; Limits says what it will not. */}
              <Link
                href="/features#limits"
                className="group mt-8 inline-flex items-center gap-2 border-b border-line pb-1 text-[14px] font-medium text-ink transition-colors hover:border-ink"
              >
                And the short list of what it will not do
                <Icon
                  name="arrowRight"
                  size={15}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Link>
            </div>

            <div className="space-y-6">
              {GROUNDING.map(([icon, title, body], i) => (
                <div key={title} className="stagger flex gap-4" style={{ '--i': i }}>
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-paper text-ink ring-1 ring-line">
                    <Icon name={icon} size={17} />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Reveal>

      {/* ═════════════════════════════════════════════ faq ════════════ */}
      {/* Unnumbered: the numbers are for the argument, and this is the
          appendix to it. Same treatment /compare gives its sources section. */}
      <Reveal as="section" id="faq" className="scroll-mt-24 border-b border-line-soft bg-canvas py-24 sm:py-32">
        <Container>
          <SectionMark label="Questions" title="What it is, and what happens to what you tell it." />
          <div className="mt-14">
            <FaqAccordion items={FAQ_PRODUCT} />
          </div>
        </Container>
      </Reveal>

      <CloseCard
        title="It takes longer to read this page than to set it up."
        lede="Ten free minutes on signup. Enough to run a real interview end to end."
      />
    </>
  )
}
