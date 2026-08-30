import { headers } from 'next/headers'
import Icon from '@/components/ui/Icon'
import { Container, Button, Badge } from '@/components/ui'
import { SiteNav, SiteFooter } from '@/components/marketing/SiteChrome'
import SectionMark from '@/components/marketing/SectionMark'
import Reveal, { ScrollProgress } from '@/components/marketing/Reveal'
import ComparisonTable from '@/components/marketing/ComparisonTable'
import { resolveCurrency, singlePackForCurrency } from '@/lib/pricing'
import { gatewayFor } from '@/lib/gateway'
import {
  COLUMNS, COMPETITORS, featureGroupsFor, US,
  SOURCE_DATE, SOURCE_LABEL, SOURCE_URL, competitorPrice,
} from '@/lib/comparison'

/*
  COMPARE 2026-08-30 ─────────────────────────────────────────────────────────

  Built from a reference the user supplied: a five-column "AI interview
  assistant" price-and-feature comparison. Two things about it were changed on
  purpose, and both are the reason this page is worth having at all.

  1. NOTHING IS INVENTED. Competitor figures come from one published source on
     one date, both of which are printed on the page. Where that source said
     nothing, the cell says "not stated" rather than carrying a tick nobody
     checked — see the PROVENANCE block in lib/comparison.js. Our own column is
     read off this repo, which is why some of its cells are caveats and some are
     crosses. A comparison table where the author wins every row is one nobody
     believes.

  2. WE DO NOT CHARACTERISE THEIR PRODUCTS. Several cells that used to assert
     things about the other four — that they write in the candidate's voice, that
     they are not meant to be disclosed — were inferences dressed as findings.
     They are 'unknown' now. Our own column is the only one making claims about
     behaviour, because it is the only one anybody here can read the code for.

  CONCEPT 2026-08-30 ─ WHAT THIS PAGE USED TO ARGUE, AND WHY IT NO LONGER CAN.
  The page was built on a category split: four of these help the person being
  interviewed, ours helps the person running it. Ours answers for the candidate
  now, so that argument is gone and pretending otherwise would make this the most
  dishonest page on the site. What is left is a real comparison inside one
  category — what an hour costs, what happens to credits you do not spend, what
  each one will and will not claim to be — plus one row we still win outright
  (the app also runs the interviewer's side) and one we lose outright (there is no
  practice mode). That is a weaker argument than the old one. It is also true.

  Our prices are NOT duplicated here. They come through lib/pricing.js in the
  visitor's own currency, the same call the landing page and /api/checkout make,
  so this page cannot quote a number that checkout will not honour.
*/

export const metadata = {
  title: 'Compare AI interview assistants — Smart Hire AI',
  /* PIVOT 2026-08-30: was "… the difference that matters: four of them help the
     candidate answer, this one helps the interviewer ask." Ours answers too. */
  description:
    'Smart Hire AI compared with Parakeet AI, Final Round AI, LockedIn AI and Interview ' +
    'Warmup — what an hour costs, what happens to unused credits, and what each one ' +
    'will and will not claim to be.',
}

/*
  "Use the other four if / use this one if". The honest version of a comparison
  page's closing section: the left column is a real recommendation to leave, and
  it is first because for a good share of this page's traffic it is the correct
  answer.
*/
/*
  CONCEPT 2026-08-30: both lists were written around the category split and have
  been rewritten around what the products actually do differently. The old ones,
  kept per the convention in this repo:

  const THEIRS = [
    'You are the one being interviewed, and you want help answering.',
    'You want the tool to produce something you can read out loud.',
    'You are practising on your own before the real thing.',
    'You want feedback on how you came across, or a way to rehearse beforehand.',
  ]

  const OURS = [
    'You are running the interview and you want better questions, not answers.',
    'You have to be able to tell the candidate what you are using, and defend it to HR.',
    'You interview in bursts and would rather buy hours than hold a subscription.',
    'You want the judgement to stay yours — no score, no ranking, no recommendation.',
  ]

  The first line of THEIRS below is the one that matters, and it is deliberately
  the first thing a reader meets in that card: a script to read out verbatim is
  something this app will not produce, so anybody who wants that should buy
  another one. Do not soften it into a feature we are "working on".
*/
const THEIRS = [
  'You want a line written in your voice that you can read out word for word.',
  'You are rehearsing on your own, and want feedback afterwards on how it went.',
  'You want the extras around the interview — question banks, mock rounds, a coach.',
  'A monthly subscription suits you better than buying hours as you need them.',
]

const OURS = [
  'You want the answer while the question is still being asked, not a review afterwards.',
  'You would rather buy hours that never expire than hold a subscription for one week of interviews.',
  'You want every claim tagged to your CV, and a plain “not sure” when there is nothing behind it.',
  'You sometimes sit in the other chair too — the same app switches to suggesting follow-ups.',
]

export default async function ComparePage() {
  // Same call the landing page makes, and for the same reason: the visitor sees
  // the price they will actually be charged. It opts this page into dynamic
  // rendering, which is the accepted trade.
  const currency = resolveCurrency(await headers())
  const single = singlePackForCurrency(currency)

  /*
    RAZORPAY 2026-08-30: the UPI row is filled in from live configuration rather
    than written into lib/comparison.js.

    gatewayFor('INR') is the SAME call app/api/checkout/route.js makes to decide
    where an Indian buyer's money goes, so the table cannot claim a payment
    method the checkout it describes would not actually offer. Asked about INR
    explicitly, not about `currency`: the row is a statement about what Indian
    buyers get, and it must read the same for a visitor being priced in dollars.
  */
  const featureGroups = featureGroupsFor({ upiLive: gatewayFor('INR') === 'razorpay' })

  // The one place our price enters the comparison data. Everything else about
  // our column lives in lib/comparison.js; the number lives in lib/pricing.js.
  const priceFor = (col) =>
    col.key === US
      ? { display: single.price, listedInInr: false }
      : competitorPrice(col, currency)

  return (
    <div className="min-h-screen bg-paper">
      <ScrollProgress />
      <SiteNav />

      <main>
        {/* ═══════════════════════════════════════════════ hero ═════════ */}
        <section className="border-b border-line-soft">
          <Container wide className="py-16 sm:py-24">
            <div className="max-w-3xl">
              <Badge tone="neutral" className="mb-7">
                <Icon name="search" size={12} />
                Comparison · updated {SOURCE_DATE}
              </Badge>

              {/* <h1 …>Four of these are built for the candidate. One is built for you.</h1> */}
              <h1 className="hl text-[clamp(2.1rem,4.4vw,3.4rem)] text-ink">
                Five tools for the same ten seconds. One charges by the hour.
              </h1>

              <p className="mt-8 max-w-2xl text-[17px] leading-relaxed text-muted">
                Parakeet AI, Final Round AI, LockedIn AI and Interview Warmup all help the
                person answering the questions. So does Smart Hire AI. What separates them
                is what an hour costs, what happens to the credits you do not spend, and
                what each one is willing to claim to be — which is what the table below is
                for.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Button href="#table" size="lg" iconRight="arrowRight">See the full table</Button>
                <Button href="/signup" variant="secondary" size="lg">
                  Start with ten free minutes
                </Button>
              </div>
            </div>
          </Container>
        </section>

        {/* ══════════════════════════════════════ 01 the two sides ══════ */}
        <Reveal as="section" className="border-b border-line-soft bg-canvas py-24 sm:py-32">
          <Container wide>
            {/* CONCEPT 2026-08-30: was label "The split" / "Same call. Opposite
                chairs." — the category argument. Same layout, different point:
                the split is no longer who they are for, it is what they are
                prepared to say they do. */}
            <SectionMark
              no="01"
              label="The line"
              title="Same chair. Different promises."
              lede="All five are pointed at the moment a question lands on you. Where they part company is what they hand you, and how much of it they are willing to put in writing."
            />

            {/*
              The signature element of this page. A four-to-one split rather than
              a five-across grid — kept from the category version, because it
              still separates the one column whose claims can be checked against
              a repository from the four that were read off a price table.
            */}
            <div className="mt-16 grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:gap-10">
              <div className="rounded-2xl border border-line bg-paper p-8">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-canvas-2 text-muted">
                    <Icon name="users" size={17} />
                  </span>
                  <div>
                    <p className="mono text-[11px] uppercase tracking-[0.16em] text-faint">
                      The other four
                    </p>
                    <p className="text-[15px] font-semibold text-ink">Candidate-side assistants</p>
                  </div>
                </div>

                <ul className="mt-7 space-y-px overflow-hidden rounded-xl border border-line-soft bg-line-soft">
                  {COMPETITORS.map(c => (
                    <li key={c.key} className="flex items-baseline justify-between gap-4 bg-paper px-5 py-3.5">
                      <span className="text-[14.5px] font-medium text-ink-soft">{c.name}</span>
                      <span className="text-[13px] text-faint">{c.tagline}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-6 text-[14px] leading-relaxed text-muted">
                  They read the question and produce the answer, which is what this one does
                  too. Beyond that we are going on their own published descriptions — how
                  each behaves in a live call is theirs to state, not ours to characterise
                  here, and the table marks those rows “not stated” rather than guessing.
                </p>
              </div>

              <div className="relative overflow-hidden rounded-2xl bg-ink p-8 text-paper">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 -top-1/2 h-full"
                  style={{
                    background:
                      'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.12), transparent 62%)',
                  }}
                />
                <div className="relative">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-paper/10 text-paper">
                      <Icon name="mic" size={17} />
                    </span>
                    <div>
                      <p className="mono text-[11px] uppercase tracking-[0.16em] text-paper/45">
                        Also candidate-side
                      </p>
                      <p className="text-[15px] font-semibold text-paper">Smart Hire AI</p>
                    </div>
                  </div>

                  {/* CONCEPT 2026-08-30: was "Built for the next question, not
                      the candidate's answer." It answers the candidate's
                      question now, so the headline is the part that did not
                      change with the concept — it hands you the answer and does
                      not pretend to be the one giving it. Every line below is
                      checkable in apps/desktop/src/services/systemPrompt.js. */}
                  <p className="hl mt-8 text-[clamp(1.5rem,2.6vw,2rem)] text-paper">
                    Gives you the answer. Never claims to be you.
                  </p>

                  <ul className="mt-8 space-y-3.5">
                    {[
                      'The answer on the first line, one sentence behind it — readable mid-question',
                      'Tagged [resume] or [JD], so you can see which part is a fact about you',
                      'No first person, no script to read out, and it says it is an AI if asked',
                    ].map(text => (
                      <li key={text} className="flex gap-3 text-[14px] leading-relaxed text-paper/70">
                        <Icon name="check" size={15} className="mt-0.5 shrink-0 text-paper" />
                        {text}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </Container>
        </Reveal>

        {/* ═════════════════════════════════════════ 02 prices ══════════ */}
        <Reveal as="section" className="border-b border-line-soft py-24 sm:py-32">
          <Container wide>
            <SectionMark
              no="02"
              label="Prices"
              title="What each one costs to start."
              lede="Ours is the price you will actually be charged, in your currency. The other four are as they were listed on one page on one day — check them before you rely on them."
              center
            />

            <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {COLUMNS.map((col, i) => {
                const { display, listedInInr } = priceFor(col)
                return (
                  <div
                    key={col.key}
                    className={[
                      'stagger flex flex-col rounded-2xl p-6',
                      col.us
                        ? 'bg-ink text-paper shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)]'
                        : 'border border-line bg-paper',
                    ].join(' ')}
                    style={{ '--i': i }}
                  >
                    <p
                      className={`mono text-[10px] uppercase tracking-[0.14em] ${
                        col.us ? 'text-paper/45' : 'text-faint'
                      }`}
                    >
                      {/* CONCEPT 2026-08-30: 'both' is ours — the app ships an
                          answer mode and a follow-up mode. Kept as an expression
                          here rather than importing ComparisonTable's SIDE_LABEL:
                          these cards are wider than a table header and use the
                          longer wording.
                          {col.side === 'asking' ? 'Interviewer-side' : 'Candidate-side'} */}
                      {col.side === 'both'
                        ? 'Both sides'
                        : col.side === 'asking'
                          ? 'Interviewer-side'
                          : 'Candidate-side'}
                    </p>

                    <p
                      className={`mt-2 text-[15px] font-semibold ${col.us ? 'text-paper' : 'text-ink'}`}
                    >
                      {col.name}
                    </p>

                    <p
                      className={`hl mt-6 text-[clamp(1.6rem,2.4vw,1.95rem)] ${
                        col.us ? 'text-paper' : 'text-ink'
                      }`}
                      data-numeric
                    >
                      {display}
                    </p>

                    <p
                      className={`mt-1.5 text-[12.5px] leading-snug ${
                        col.us ? 'text-paper/55' : 'text-muted'
                      }`}
                    >
                      {col.priceNote}
                    </p>

                    {/* Only ever shown on a competitor card, and only when the
                        source listed that product in rupees and the visitor is
                        being priced in dollars. Silently mixing units would be
                        the lie this note exists to prevent. */}
                    {listedInInr && (
                      <p className="mono mt-2 text-[10.5px] uppercase tracking-[0.1em] text-faint">
                        Listed in ₹ only
                      </p>
                    )}

                    <div className="mt-auto pt-7">
                      {col.us ? (
                        <Button href="/signup" variant="inverse" size="sm" className="w-full">
                          Get started
                        </Button>
                      ) : (
                        <p className="text-[12.5px] leading-snug text-faint">{col.tagline}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="mt-8 text-center text-[13px] leading-relaxed text-muted">
              Ours also runs as a subscription with unlimited interview time, and in larger
              credit packs that work out cheaper per hour —{' '}
              <a
                href="/#pricing"
                className="font-medium text-ink underline underline-offset-2 transition-colors hover:text-accent"
              >
                see the full pricing
              </a>
              .
            </p>
          </Container>
        </Reveal>

        {/* ══════════════════════════════════════════ 03 the table ══════ */}
        <Reveal as="section" id="table" className="scroll-mt-24 border-b border-line-soft bg-canvas py-24 sm:py-32">
          <Container wide>
            <SectionMark
              no="03"
              label="Feature by feature"
              title="Where the ticks stop matching."
              lede="Our column is read off this repository rather than off our own marketing, which is why two of its cells are crosses and one is a caveat."
            />
          </Container>

          <Container wide className="mt-14">
            <ComparisonTable columns={COLUMNS} groups={featureGroups} />
          </Container>
        </Reveal>

        {/* ══════════════════════════════════════ 04 which one ══════════ */}
        <Reveal as="section" className="border-b border-line-soft py-24 sm:py-32">
          <Container wide>
            <SectionMark
              no="04"
              label="Which one you want"
              title="If it is one of the other four, that is a fine answer."
              lede="A comparison page that concludes “buy ours” regardless of who is reading it is an advert. Here is the honest split."
            />

            <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
              <div className="bg-paper p-8">
                <p className="mono text-[11px] uppercase tracking-[0.16em] text-faint">
                  Use one of the other four if
                </p>
                <ul className="mt-7 space-y-4">
                  {THEIRS.map(text => (
                    <li key={text} className="flex gap-3 text-[14.5px] leading-relaxed text-ink-soft">
                      <Icon name="arrowRight" size={16} className="mt-1 shrink-0 text-faint" />
                      {text}
                    </li>
                  ))}
                </ul>
                {/*
                  The honest disclosure, and it sits HERE — in the card a reader
                  is on at the moment they decide whether the product is for them
                  — rather than buried in the method note at the bottom.

                  CONCEPT 2026-08-30: it used to disclose that the interviewer's
                  tool could be pointed at the candidate's side. Now it discloses
                  the two things the candidate's tool will not do, which are the
                  first two entries in THEIRS. Both are real limits of the build,
                  not positioning: there is no practice mode anywhere in
                  apps/desktop, and the first-person instructions are commented
                  out at the head of systemPrompt.js with a note saying they do
                  not come back.
                */}
                <p className="mt-8 border-t border-line-soft pt-6 text-[13.5px] leading-relaxed text-muted">
                  The first two are the ones to take seriously. Nothing here writes in your
                  voice or hands you a line to read out as your own — the prompt refuses it,
                  and it will still say it is an AI if the room asks it directly. And there is
                  no practice mode: it runs during a live interview or not at all. If either
                  of those is what you came for, one of the other four is the better buy.
                </p>
              </div>

              <div className="bg-canvas p-8">
                <p className="mono text-[11px] uppercase tracking-[0.16em] text-ink">
                  Use Smart Hire AI if
                </p>
                <ul className="mt-7 space-y-4">
                  {OURS.map(text => (
                    <li key={text} className="flex gap-3 text-[14.5px] leading-relaxed text-ink">
                      <Icon name="check" size={16} className="mt-1 shrink-0 text-positive" />
                      {text}
                    </li>
                  ))}
                </ul>
                <p className="mt-8 border-t border-line pt-6 text-[13.5px] leading-relaxed text-muted">
                  Ten free minutes on a new account, no card. Enough to run one real interview
                  end to end and decide.
                </p>
              </div>
            </div>
          </Container>
        </Reveal>

        {/* ═══════════════════════════════════════ how we got these ═════ */}
        <Reveal as="section" className="border-b border-line-soft bg-canvas py-20 sm:py-24">
          <Container>
            <div className="rounded-2xl border border-line bg-paper p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-canvas-2 text-ink">
                  <Icon name="file" size={17} />
                </span>
                <h2 className="text-[16px] font-semibold text-ink">Where these numbers came from</h2>
              </div>

              <div className="mt-6 space-y-4 text-[14px] leading-relaxed text-muted">
                <p>
                  Every figure in the other four columns was read on {SOURCE_DATE} from a
                  published comparison at{' '}
                  <a
                    href={SOURCE_URL}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                    className="font-medium text-ink underline underline-offset-2 transition-colors hover:text-accent"
                  >
                    {SOURCE_LABEL}
                  </a>
                  . None of it has been checked against those vendors’ own pricing pages, and
                  none of it was converted, estimated or filled in — where that source said
                  nothing, the cell says “not stated” rather than carrying a mark nobody
                  verified.
                </p>
                {/* CORRECTION 2026-08-30: cited coding support as the example of
                    a caveat. That row was wrong and is now a plain tick — see
                    the note on it in lib/comparison.js. The example moved to UPI,
                    which is a real caveat: checkout names no payment methods, so
                    what a buyer is offered depends on the Stripe account. */}
                <p>
                  Our own column is not marketing copy either. Each cell is checked against
                  the shipped build, which is why two of its rows are crosses and the payment
                  row is a caveat rather than a tick.
                </p>
                <p>
                  It has already been wrong once. Coding support first went up as a caveat
                  saying the app would not write the solution — a limit that turned out to
                  exist nowhere in the code, since a screenshot is answered in both of the
                  app’s modes. It is a plain tick now. If you find another cell that does not
                  match the software, that is a bug in this page and worth telling us about.
                </p>
                <p>
                  Prices on this kind of product move quickly. If you are about to make a
                  decision on one of these numbers, open the vendor’s page and read it there.
                  Ours is the exception: it is generated from the same price table checkout
                  charges from, so it cannot be out of date.
                </p>
              </div>
            </div>
          </Container>
        </Reveal>

        {/* ═══════════════════════════════════════════ close ════════════ */}
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
                {/* <h2 …>Still on the asking side of the table?</h2> */}
                <h2 className="hl mx-auto max-w-[21ch] text-[clamp(1.9rem,3.4vw,2.75rem)] text-paper">
                  Read the table, then try it on a real one.
                </h2>
                <p className="mx-auto mt-6 max-w-md text-[16px] leading-relaxed text-paper/60">
                  Ten free minutes on signup, and {single.price} for a single hour after that.
                  No subscription to start.
                </p>

                <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                  <Button href="/signup" size="lg" variant="inverse">
                    Create your account
                  </Button>
                  <a
                    href="/"
                    className="border-b border-paper/25 pb-0.5 text-[15px] font-medium text-paper/75 transition-colors hover:border-paper hover:text-paper"
                  >
                    See how it works
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
      </main>

      <SiteFooter />
    </div>
  )
}
