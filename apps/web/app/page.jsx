import { headers } from 'next/headers'
import Icon from '@/components/ui/Icon'
import { Container, Button, Card, Badge, SectionHeading } from '@/components/ui'
import { SiteNav, SiteFooter } from '@/components/marketing/SiteChrome'
import PricingPlans from '@/components/marketing/PricingPlans'
import { PlatformMark } from '@/components/marketing/PlatformMarks'
import { createClient } from '@/lib/supabase-server'
import {
  resolveCurrency, tiersForCurrency, packsForCurrency, singlePackForCurrency,
} from '@/lib/pricing'

const FEATURES = [
  { icon: 'mic',    title: 'Hears the question',   body: 'Captures the interviewer through your microphone and transcribes each question as it is asked.' },
  { icon: 'file',   title: 'Knows your résumé',    body: 'Every answer is drawn from the experience you actually have. It never invents a project you did not work on.' },
  { icon: 'bolt',   title: 'Answers as you listen', body: 'Responses stream word by word, so the beginning is on screen before the question has finished landing.' },
  { icon: 'eye',    title: 'Invisible on screen',  body: 'The overlay is excluded from screen capture and screen sharing. Your interviewer sees your desktop, not the assistant.' },
  { icon: 'shield', title: 'Stays on your machine', body: 'Your résumé and transcripts never leave your computer. Only the question text is sent to generate an answer.' },
  { icon: 'lock',   title: 'Nothing to configure', body: 'No API keys, no billing setup, no model wrangling. Your plan covers the AI cost.' },
]

const PLATFORMS = [
  { key: 'zoom',  name: 'Zoom' },
  { key: 'teams', name: 'Microsoft Teams' },
  { key: 'meet',  name: 'Google Meet' },
  { key: 'webex', name: 'Webex' },
  { key: 'lark',  name: 'Lark' },
  { key: 'chime', name: 'Amazon Chime' },
]

const STEPS = [
  { n: '01', title: 'Add your context', body: 'Paste your résumé and the job description once. The assistant uses them to shape every answer it gives.' },
  { n: '02', title: 'Start the session', body: 'Open the overlay before your call. It listens for questions and stays hidden from anything you share.' },
  { n: '03', title: 'Read and speak',    body: 'Answers appear the moment a question is asked, in your own voice and grounded in your own experience.' },
]

const FAQS = [
  ['What exactly is a credit?', 'One credit is one hour — 60 minutes — of live interview time, and it is spent a minute at a time while a session runs. A 25-minute interview costs 25 minutes and leaves the other 35 in your account for the next one. Nothing is deducted for setting up, and credits you buy never expire.'],
  ['Subscription or credits?', 'A subscription is unlimited interview time for the length of the period. Credits suit an occasional interviewer: you pay for the hours you actually use, there is nothing to cancel, and whatever you do not use stays in your account.'],
  ['What happens if I run out mid-interview?', 'The app warns you at five minutes and again at one, then ends the session when the balance reaches zero rather than running on time you have not bought. Top up and start again — there is nothing to reactivate. Subscribers never see this.'],
  ['Is there a free trial?', 'Every new account starts with ten free minutes — enough to run one real interview end to end before deciding.'],
  ['Can I cancel?', 'A subscription stops at the end of the period you have already paid for. Credits are not a subscription at all: you buy them once and spend them whenever you have a call.'],
  ['Can the interviewer see it?', 'No. The overlay is marked as excluded from screen capture, so it does not appear in Zoom, Meet, Teams or any recording — even when you share your entire screen.'],
  ['Do I need my own API key?', 'No. Your plan covers the AI cost. There is nothing to sign up for and nothing to paste into the app.'],
  ['Where does my résumé go?', 'It stays on your machine. When a question is asked, only the question and the context needed to answer it are sent for processing.'],
  ['Which platforms are supported?', 'macOS and Windows. One licence key activates the app, and your balance lives on your account — so it follows you to either machine.'],
]

// resolveCurrency reads the request's geo headers, which opts this page into
// dynamic rendering. That is the trade for showing every visitor the price they
// will actually be charged — it is the same call /api/checkout makes, so the
// page and the charge cannot disagree.
export default async function HomePage() {
  const currency = resolveCurrency(await headers())
  const single = singlePackForCurrency(currency)

  // Only decides whether Buy goes straight to Stripe or via signup first. A
  // logged-out visitor still sees every price.
  let signedIn = false
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    signedIn = !!user
  } catch {
    // The marketing page has to render for anonymous visitors even if auth is
    // briefly unavailable; falling back to "signed out" just routes via signup.
  }

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-line-soft">
          <Container wide className="py-20 sm:py-28">
            <div className="max-w-3xl">
              <Badge tone="accent" className="mb-6">
                <Icon name="sparkle" size={12} />
                For live, unscripted interviews
              </Badge>

              <h1 className="display text-[2.75rem] leading-[1.05] text-ink sm:text-[4rem]">
                Answer any question
                <br />
                <span className="display-italic">before you speak.</span>
              </h1>

              <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-muted">
                An overlay that listens to your interview, understands the question, and writes
                your answer from your own résumé — while the interviewer is still finishing
                the sentence.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Button href="/signup" size="lg" iconRight="arrowRight">Get started</Button>
                <Button href="#how" variant="secondary" size="lg">See how it works</Button>
              </div>

              {/* A price above the fold. Visitors who care what this costs go
                  looking for the number first, and leave if they cannot find it
                  before the pricing section. */}
              <p className="mt-5 text-[13px] text-muted">
                Ten free minutes to start, then from{' '}
                <a
                  href="#pricing"
                  className="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
                >
                  <span data-numeric>{single.price}</span> for a single hour
                </a>{' '}
                — no subscription required.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-faint">
                {['No API key required', 'Hidden from screen sharing', 'macOS and Windows'].map(t => (
                  <span key={t} className="flex items-center gap-1.5">
                    <Icon name="check" size={14} className="text-positive" />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Product frame — a still of the overlay rather than a stock image */}
            <div className="mt-16 overflow-hidden rounded-2xl border border-line bg-canvas shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_-12px_rgba(0,0,0,0.12)]">
              <div className="flex items-center gap-2 border-b border-line bg-canvas-2 px-4 py-3">
                <span className="flex gap-1.5">
                  {['#e5e3df', '#e5e3df', '#e5e3df'].map((c, i) => (
                    <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                  ))}
                </span>
                <span className="ml-2 flex items-center gap-1.5 text-[11px] text-faint">
                  <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                  Listening
                </span>
                <span className="ml-auto text-[11px] text-faint" data-numeric>12:04</span>
              </div>

              <div className="grid gap-px bg-line sm:grid-cols-[1fr_1.4fr]">
                <div className="bg-paper p-5">
                  <p className="eyebrow mb-3">Question heard</p>
                  <p className="text-[14px] leading-relaxed text-ink">
                    “Tell me about a time you had to make a technical decision without
                    complete information.”
                  </p>
                  <p className="mt-3 text-[11px] text-faint" data-numeric>just now</p>
                </div>
                <div className="bg-paper p-5">
                  <p className="eyebrow mb-3">Your answer</p>
                  <p className="text-[14px] leading-relaxed text-ink-soft">
                    At Xenett I had to choose a sync strategy for our ledger import before we
                    had usage data. I scoped a two-week spike comparing incremental against
                    full reconciliation, measured both against a replayed month of client
                    data, and shipped the incremental path with a nightly full check as a
                    safety net<span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-ink align-middle" />
                  </p>
                </div>
              </div>
            </div>
          </Container>
        </section>

        {/* Platform compatibility */}
        <section className="border-b border-line-soft bg-canvas py-20 sm:py-24">
          <Container wide>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
              <Icon name="shield" size={19} className="text-positive" />
              <h2 className="text-[17px] font-semibold text-ink">
                Works with the tools your meetings already run on
              </h2>
              <span className="text-faint">·</span>
              <span className="text-[14px] text-muted">Checked 9 days ago</span>
            </div>

            {/* gap-px over a bg-line grid with bg-paper cells gives hairline
                dividers without any border-collapse math -- same idiom as STEPS. */}
            <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
              {PLATFORMS.map((p) => (
                <div key={p.key} className="bg-paper p-7">
                  <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-canvas-2 text-ink-soft">
                    <PlatformMark name={p.key} size={30} />
                  </span>
                  <h3 className="text-[15px] font-semibold text-ink">{p.name}</h3>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                    Supported
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-8 text-center text-[14px] text-muted">
              Open one to try it on a real call.
            </p>
          </Container>
        </section>

        {/* How it works */}
        <section id="how" className="border-b border-line-soft py-20 sm:py-24">
          <Container wide>
            <SectionHeading
              eyebrow="How it works"
              title="Three steps, once."
              lede="Set it up before your first interview and it is ready for every one after that."
            />
            <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
              {STEPS.map(step => (
                <div key={step.n} className="bg-paper p-7">
                  <p className="display text-[1.5rem] text-faint" data-numeric>{step.n}</p>
                  <h3 className="mt-4 text-[15px] font-semibold text-ink">{step.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted">{step.body}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>

        {/* Features */}
        <section id="features" className="border-b border-line-soft bg-canvas py-20 sm:py-24">
          <Container wide>
            <SectionHeading
              eyebrow="Features"
              title="Built for the moment you are put on the spot."
            />
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(f => (
                <Card key={f.title}>
                  <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-canvas-2 text-ink">
                    <Icon name={f.icon} size={17} />
                  </span>
                  <h3 className="text-[15px] font-semibold text-ink">{f.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted">{f.body}</p>
                </Card>
              ))}
            </div>
          </Container>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-24 border-b border-line-soft py-20 sm:py-24">
          <Container wide>
            <SectionHeading
              eyebrow="Pricing"
              title="Go unlimited, or pay by the hour."
              lede="Subscribe for unlimited interview time, or buy credits — one credit is one hour, metered by the minute. Use 30 minutes of an hour and the other 30 stay in your account until you need them."
            />
            <div className="mt-14">
              <PricingPlans
                tiers={tiersForCurrency(currency)}
                packs={packsForCurrency(currency)}
                singlePack={single}
                signedIn={signedIn}
              />
            </div>

            {/* Reassurance, at the point the decision is actually made. */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-line-soft pt-8 text-[13px] text-muted">
              {[
                ['lock',   'Card details go straight to Stripe'],
                ['gift',   'Ten free minutes on every new account'],
                ['clock',  'Unused credits never expire'],
                ['shield', 'Cancel a subscription any time'],
              ].map(([icon, text]) => (
                <span key={text} className="flex items-center gap-2">
                  <Icon name={icon} size={15} className="text-faint" />
                  {text}
                </span>
              ))}
            </div>
          </Container>
        </section>

        {/* FAQ */}
        <section className="border-b border-line-soft py-20 sm:py-24">
          <Container>
            <SectionHeading eyebrow="Questions" title="Before you ask." />
            <dl className="mt-12 divide-y divide-line border-t border-line">
              {FAQS.map(([q, a]) => (
                <div key={q} className="grid gap-2 py-6 sm:grid-cols-[1fr_1.5fr] sm:gap-10">
                  <dt className="text-[15px] font-medium text-ink">{q}</dt>
                  <dd className="text-[14px] leading-relaxed text-muted">{a}</dd>
                </div>
              ))}
            </dl>
          </Container>
        </section>

        {/* Close */}
        <section className="py-20 sm:py-28">
          <Container>
            <div className="rounded-2xl bg-ink px-8 py-14 text-center sm:px-14">
              <h2 className="display text-[2rem] text-paper sm:text-[2.75rem]">
                Your next interview is
                <br />
                <span className="display-italic">already scheduled.</span>
              </h2>
              <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-paper/60">
                Set it up in the time it takes to read the job description again.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Button href="/signup" size="lg" className="bg-paper text-ink hover:bg-canvas-2">
                  Create your account
                </Button>
                <Button href="/login" size="lg" variant="ghost" className="text-paper/80 hover:bg-paper/10 hover:text-paper">
                  I already have one
                </Button>
              </div>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-6 border-t border-paper/10 pt-8 text-[13px] text-paper/50">
                <span className="flex items-center gap-2"><Icon name="apple" size={15} /> macOS</span>
                <span className="flex items-center gap-2"><Icon name="windows" size={15} /> Windows</span>
              </div>
            </div>
          </Container>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
