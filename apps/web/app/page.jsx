import Icon from '@/components/ui/Icon'
import { Container, Button, Card, Badge, SectionHeading } from '@/components/ui'
import { SiteNav, SiteFooter } from '@/components/marketing/SiteChrome'

const FEATURES = [
  { icon: 'mic',    title: 'Hears the question',   body: 'Captures the interviewer through your microphone and transcribes each question as it is asked.' },
  { icon: 'file',   title: 'Knows your résumé',    body: 'Every answer is drawn from the experience you actually have. It never invents a project you did not work on.' },
  { icon: 'bolt',   title: 'Answers as you listen', body: 'Responses stream word by word, so the beginning is on screen before the question has finished landing.' },
  { icon: 'eye',    title: 'Invisible on screen',  body: 'The overlay is excluded from screen capture and screen sharing. Your interviewer sees your desktop, not the assistant.' },
  { icon: 'shield', title: 'Stays on your machine', body: 'Your résumé and transcripts never leave your computer. Only the question text is sent to generate an answer.' },
  { icon: 'lock',   title: 'Nothing to configure', body: 'No API keys, no billing setup, no model wrangling. Your licence covers the AI cost.' },
]

const STEPS = [
  { n: '01', title: 'Add your context', body: 'Paste your résumé and the job description once. The assistant uses them to shape every answer it gives.' },
  { n: '02', title: 'Start the session', body: 'Open the overlay before your call. It listens for questions and stays hidden from anything you share.' },
  { n: '03', title: 'Read and speak',    body: 'Answers appear the moment a question is asked, in your own voice and grounded in your own experience.' },
]

const PLANS = [
  { name: 'Monthly',  cadence: 'Billed monthly',   features: ['Unlimited sessions', 'All models', 'Email support'] },
  { name: 'Yearly',   cadence: 'Billed annually',  features: ['Everything in Monthly', 'Priority support'], featured: true },
  { name: 'Lifetime', cadence: 'One payment',      features: ['Everything in Yearly', 'All future updates', 'Never expires'] },
]

const FAQS = [
  ['Can the interviewer see it?', 'No. The overlay is marked as excluded from screen capture, so it does not appear in Zoom, Meet, Teams or any recording — even when you share your entire screen.'],
  ['Do I need my own API key?', 'No. Your licence covers the AI cost. There is nothing to sign up for and nothing to paste into the app.'],
  ['Where does my résumé go?', 'It stays on your machine. When a question is asked, only the question and the context needed to answer it are sent for processing.'],
  ['Which platforms are supported?', 'macOS and Windows. One licence key activates the app on your machine.'],
]

export default function HomePage() {
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
        <section id="pricing" className="border-b border-line-soft py-20 sm:py-24">
          <Container wide>
            <SectionHeading
              eyebrow="Pricing"
              title="One licence, every interview."
              lede="Checkout is not open yet — get in touch and we will issue a licence to your account."
            />
            <div className="mt-14 grid gap-5 sm:grid-cols-3">
              {PLANS.map(plan => (
                <Card key={plan.name} className={plan.featured ? 'ring-1 ring-ink' : ''}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-[15px] font-semibold text-ink">{plan.name}</h3>
                    {plan.featured && <Badge tone="accent">Most chosen</Badge>}
                  </div>
                  <p className="mt-1 text-[13px] text-muted">{plan.cadence}</p>

                  <ul className="mt-6 space-y-2.5 border-t border-line-soft pt-6">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2.5 text-[14px] text-ink-soft">
                        <Icon name="check" size={15} className="mt-0.5 shrink-0 text-positive" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Button
                    href="/signup"
                    variant={plan.featured ? 'primary' : 'secondary'}
                    className="mt-7 w-full"
                  >
                    Get started
                  </Button>
                </Card>
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
