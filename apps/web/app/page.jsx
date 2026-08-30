import { headers } from 'next/headers'
import Icon from '@/components/ui/Icon'
import { Container, Button, Badge } from '@/components/ui'
import { SiteNav, SiteFooter } from '@/components/marketing/SiteChrome'
import PricingPlans from '@/components/marketing/PricingPlans'
import { PlatformMark, PlatformMarkDefs } from '@/components/marketing/PlatformMarks'
import Reveal, { ScrollProgress } from '@/components/marketing/Reveal'
import Ticker from '@/components/marketing/Ticker'
import LiveDemo from '@/components/marketing/LiveDemo'
import FaqAccordion from '@/components/marketing/FaqAccordion'
import { createClient } from '@/lib/supabase-server'
import {
  resolveCurrency, tiersForCurrency, packsForCurrency, singlePackForCurrency,
} from '@/lib/pricing'

/*
  REDESIGN 2026-08-30: rebuilt against the reference design supplied by the user
  — numbered section markers, the animated product frame in the hero, the
  scrolling ticker, the stage rail, tabbed pricing, an accordion FAQ and the dark
  closing card. Headlines moved from Instrument Serif to Inter Tight and the
  small labelling to IBM Plex Mono, which is what gives the reference its look.

  The reference's CONTENT was not ported. It sells the covert candidate-side tool
  this app used to be — "the answer is on screen before you speak", a five-point
  section on being absent from screen shares, the process list and focus
  detection, and HackerRank and CoderPad as tested platforms. The app writes the
  interviewer's follow-up questions now, so the words here are the interviewer's.

  Nothing on this page claims a latency figure. The reference showed a "4 seconds"
  promise throughout; there is no measured number for this app, so the stage rail
  below names the stages and skips the timings rather than inventing them.
*/

/*
  PIVOT 2026-08-29: every entry below described the covert CANDIDATE-side tool
  this app used to be.

  CORRECTION 2026-08-30: the note that stood here claimed setContentProtection
  "was deleted" and that systemPrompt.js already opened "You help the person
  CONDUCTING this job interview". Neither was true at the time — the pivot had
  happened in this file and nowhere else, so every feature below was fiction for
  a day. systemPrompt.js was rewritten on 2026-08-30 and the claims are now real.

  On screen capture: the desktop app still calls setContentProtection(true), so
  the panel is kept out of a screen share. That is the interviewer's own working
  surface — the same category as their notes or their scorecard — and this page
  makes no promise either way about it. The commitment we DO make is consent.
  Do not add copy about the window being visible.

  { icon: 'mic',    title: 'Hears the question',   body: 'Captures the interviewer through your microphone and transcribes each question as it is asked.' },
  { icon: 'file',   title: 'Knows your résumé',    body: 'Every answer is drawn from the experience you actually have. It never invents a project you did not work on.' },
  { icon: 'bolt',   title: 'Answers as you listen', body: 'Responses stream word by word, so the beginning is on screen before the question has finished landing.' },
  { icon: 'eye',    title: 'Invisible on screen',  body: 'The overlay is excluded from screen capture and screen sharing. Your interviewer sees your desktop, not the assistant.' },
  { icon: 'shield', title: 'Stays on your machine', body: 'Your résumé and transcripts never leave your computer. Only the question text is sent to generate an answer.' },
  { icon: 'lock',   title: 'Nothing to configure', body: 'No API keys, no billing setup, no model wrangling. Your plan covers the AI cost.' },
*/
const FEATURES = [
  { icon: 'mic',    title: 'Hears the room',            body: 'Listens through your microphone and transcribes each exchange as it happens. Silence is ignored, so a pause costs you nothing.' },
  { icon: 'bolt',   title: 'Two or three things to ask', body: 'After every answer it gives you the follow-ups worth asking, strongest first, streamed as the candidate is still talking.' },
  { icon: 'eye',    title: 'Catches the vague answer',   body: 'When someone talks around a question it says so, and gives you the question that pins it down.' },
  // CORRECTION 2026-08-30: said "the résumé or the company research". There is
  // no company research — /api/ai/research exists on the web side but nothing in
  // apps/desktop ever calls it, so no research text has ever reached a prompt.
  // systemPrompt.js now states the opposite outright ("You have no company
  // research, no web access"). Only the two real sources are named.
  // { icon: 'file', title: 'Says where it got that', body: 'Anything drawn from the résumé or the company research is tagged inline. …' },
  { icon: 'file',   title: 'Says where it got that',     body: 'Anything drawn from the résumé or the job description is tagged inline, [resume] or [JD]. If nothing supports a follow-up, it says “worth confirming” rather than inventing a detail.' },
  { icon: 'shield', title: 'Only with consent',          body: 'The résumé is used only after you confirm the candidate agreed to it. The check sits in the prompt builder, not the interface, so nothing can route around it.' },
  { icon: 'lock',   title: 'Nothing to configure',       body: 'No API keys, no billing setup, no model wrangling. Your plan covers the AI cost.' },
]

/*
  LOGOS 2026-08-30: the band was six meeting tools. Superset and LeetCode are
  neither — one is a campus-hiring portal, the other a coding-assessment site —
  so adding them widens what this section claims. The lede below was rewritten to
  match; the title did not need to change, because "whatever the interview is
  running on" already covered both. Eight entries also retire the six-column
  grid, which would have left two orphans on a wide screen.
*/
const PLATFORMS = [
  { key: 'zoom',     name: 'Zoom' },
  { key: 'teams',    name: 'Microsoft Teams' },
  { key: 'meet',     name: 'Google Meet' },
  { key: 'webex',    name: 'Webex' },
  { key: 'lark',     name: 'Lark' },
  { key: 'chime',    name: 'Amazon Chime' },
  { key: 'superset', name: 'Superset' },
  { key: 'leetcode', name: 'LeetCode' },
]

/*
  PIVOT 2026-08-29: the old steps, kept for reference. Step 02 was written for
  the candidate hiding the app from their interviewer, and step 03 offered
  answers "in your own voice" — which systemPrompt.js explicitly forbids.

  { n: '01', title: 'Add your context', body: 'Paste your résumé and the job description once. The assistant uses them to shape every answer it gives.' },
  { n: '02', title: 'Start the session', body: 'Open the overlay before your call. It listens for questions and stays hidden from anything you share.' },
  { n: '03', title: 'Read and speak',    body: 'Answers appear the moment a question is asked, in your own voice and grounded in your own experience.' },
*/
const STEPS = [
  // CORRECTION 2026-08-30: step 01's second sentence described a research feature
  // that does not exist. Replaced with what setup actually asks for.
  // { n: '01', title: 'Set up the interview', body: '… Background on the company is fetched while you type, with sources you can read and edit before you start.' },
  { n: '01', title: 'Set up the interview', body: 'Company and role, then the job description and the candidate’s CV if you have them. Three fields, and it remembers them between interviews.' },
  { n: '02', title: 'Get the go-ahead',     body: 'Tell the candidate a copilot is helping you, and tick the box confirming they agreed before their résumé is used. Until you do, it is never sent.' },
  { n: '03', title: 'Ask better questions', body: 'Follow-ups appear while the candidate is still answering. You choose what to ask, what to ignore, and what to write down.' },
]

/*
  The stage rail. The reference version carried a timing against each stage
  (0.0s / 0.3s / 0.9s / 4.0s) as the headline promise of the whole page. Nobody
  has measured this app, so the stages are named and the numbers are left out —
  an invented latency is the easiest claim on a page like this to be caught on.
*/
const STAGES = [
  ['They answer',        'The candidate is still talking. Nothing is asked of you yet.'],
  ['It becomes text',    'Whisper transcribes the exchange as it happens.'],
  ['Follow-ups arrive',  'Two or three, strongest first, streamed as they are written.'],
  ['You decide',         'Ask one, ignore the rest. It never speaks and never scores.'],
]

const FAQS = [
  ['What exactly is a credit?', 'One credit is one hour — 60 minutes — of live interview time, and it is spent a minute at a time while a session runs. A 25-minute interview costs 25 minutes and leaves the other 35 in your account for the next one. Nothing is deducted for setting up, and credits you buy never expire.'],
  ['Subscription or credits?', 'A subscription is unlimited interview time for the length of the period. Credits suit an occasional interviewer: you pay for the hours you actually use, there is nothing to cancel, and whatever you do not use stays in your account.'],
  ['What happens if I run out mid-interview?', 'The app warns you at five minutes and again at one, then ends the session when the balance reaches zero rather than running on time you have not bought. Top up and start again — there is nothing to reactivate. Subscribers never see this.'],
  ['Is there a free trial?', 'Every new account starts with ten free minutes — enough to run one real interview end to end before deciding.'],
  ['Can I cancel?', 'A subscription stops at the end of the period you have already paid for. Credits are not a subscription at all: you buy them once and spend them whenever you have a call.'],
  /*
    PIVOT 2026-08-29: three of the four below are no longer true.

    ['Can the interviewer see it?', 'No. The overlay is marked as excluded from screen capture, so it does not appear in Zoom, Meet, Teams or any recording — even when you share your entire screen.'],
    ['Where does my résumé go?', 'It stays on your machine. When a question is asked, only the question and the context needed to answer it are sent for processing.'],
    ['Which platforms are supported?', 'macOS and Windows. One licence key activates the app, and your balance lives on your account — so it follows you to either machine.'],

    The first was written for a candidate hiding from their interviewer, which is
    not the product; it is replaced by the consent question, which is the
    commitment this app actually makes and enforces. The second was never
    accurate — résumé text, the job description and every transcribed utterance
    are sent to our server and on to OpenAI; only PDF text extraction happens on
    the machine. The third was fine but under-specified the builds.
  */
  ['Does the candidate have to agree to this?', 'For their résumé, yes — and the app enforces it rather than trusting you to remember. Setup has a checkbox confirming the candidate agreed, and until it is ticked the résumé section is left out of the model prompt entirely. The check lives in the prompt builder, not the interface, so no part of the app can assemble a request that skips it. Telling the candidate a copilot is helping you is the norm we would expect, and what the consent record is for.'],
  ['Do I need my own API key?', 'No. Your plan covers the AI cost. There is nothing to sign up for and nothing to paste into the app — the desktop app ships no API credential of any kind.'],
  ['Where does the transcript go?', 'To our server and on to OpenAI, which is what makes the suggestions possible. Uploaded PDFs are read on your machine and the file itself is never sent, but the text in it is. We keep a record that a request happened — the account, the kind of request, and when — not the words. If that trade is wrong for your organisation, this is not the right tool.'],
  ['Which platforms are supported?', 'macOS on Apple Silicon, and 64-bit Windows. One licence key activates either, and your balance lives on the account rather than the machine. Builds are not signed yet, so the first launch needs the usual override.'],
]

const LIMITS = [
  ['It does not score anyone',
   'There is no rating, no rubric and no recommendation. It suggests questions; every judgement about the candidate stays yours.'],
  ['It does not write the report',
   'Nothing is saved after the session ends — no transcript, no summary, no history to export. Take your own notes.'],
  ['It does not join the call',
   'It listens through your microphone, so the candidate needs to be audible in your room — a speaker rather than headphones. There is no Zoom or Teams integration.'],
  ['It is not private to your machine',
   'The résumé text, the job description and every transcribed line go to our server and on to OpenAI. Uploaded PDFs are read locally and the file never leaves, but its text does.'],
  ['It does not record the call',
   'No audio is written to disk and no recording is produced. It transcribes to get at the words, and keeps none of it.'],
  ['It does not replace the interviewer',
   'It is wrong sometimes, and it says so — anything it cannot support from a document is marked “worth confirming” rather than asserted.'],
]

/** Numbered section opener: [01] · HOW IT WORKS, then the headline. */
function SectionMark({ no, label, title, lede, center = false, dark = false }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <div className={`marker ${center ? 'justify-center' : ''}`}>
        {no && (
          <span className={`marker-no ${dark ? 'border-paper/25 text-paper/75' : ''}`}>{no}</span>
        )}
        <span className={`marker-label ${dark ? 'text-paper/45' : ''}`}>{label}</span>
      </div>
      <h2 className={`hl mt-6 text-[clamp(1.9rem,3.4vw,2.75rem)] ${dark ? 'text-paper' : 'text-ink'}`}>
        {title}
      </h2>
      {lede && (
        <p className={`mt-4 text-[17px] leading-relaxed ${dark ? 'text-paper/60' : 'text-muted'}`}>
          {lede}
        </p>
      )}
    </div>
  )
}

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
      <ScrollProgress />
      <SiteNav />

      <main>
        {/* ═══════════════════════════════════════════════ hero ═════════ */}
        <section className="overflow-hidden border-b border-line-soft">
          <Container wide className="py-16 sm:py-24">
            {/* min-w-0 on the columns: a grid item defaults to min-width:auto,
                so the nowrap phrase in the headline would otherwise force the
                column wider than the viewport and the section's overflow-hidden
                would silently clip the body copy with it. */}
            <div className="grid items-center gap-16 lg:grid-cols-[1.02fr_0.98fr]">
              <div className="min-w-0">
                <Badge tone="accent" className="mb-7">
                  <Icon name="sparkle" size={12} />
                  For the person running the interview
                </Badge>

                <h1 className="hl text-[clamp(2.1rem,4.6vw,3.6rem)] text-ink">
                  Ask the question{' '}
                  {/* The phrase only refuses to wrap once there is room for it.
                      Below sm it wraps normally and the rule is dropped — an
                      underline stretched across a two-line wrap reads as a
                      rendering fault rather than as emphasis. */}
                  <span className="relative whitespace-normal sm:whitespace-nowrap">
                    you would have missed.
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

                <p className="mt-8 max-w-xl text-[17px] leading-relaxed text-muted">
                  A copilot for the interviewer. It listens to the conversation and tells you
                  what is worth asking next — the follow-up that pins down a vague answer, the
                  detail that does not match the résumé, the thing you would only have thought
                  of afterwards.
                </p>

                <div className="mt-9 flex flex-wrap items-center gap-3">
                  <Button href="/signup" size="lg" iconRight="arrowRight">Get started</Button>
                  <Button href="#how" variant="secondary" size="lg">See how it works</Button>
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
                    <span className="block text-[14px] font-medium leading-tight text-ink">
                      Hears the room
                    </span>
                    <span className="mono text-[10px] uppercase tracking-[0.1em] text-faint">
                      Mic → transcript
                    </span>
                  </span>
                </div>

                <div className="absolute -bottom-14 -right-5 hidden items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-3 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.4)] xl:flex">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-positive-soft text-positive">
                    <Icon name="shield" size={16} />
                  </span>
                  <span>
                    <span className="block text-[14px] font-medium leading-tight text-ink">
                      Gated on consent
                    </span>
                    <span className="mono text-[10px] uppercase tracking-[0.1em] text-faint">
                      Enforced in code
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </Container>
        </section>

        {/* ═════════════════════════════════════════════ ticker ═════════ */}
        <Ticker />

        {/* ═══════════════════════════════════════ 01 how it works ══════ */}
        <Reveal as="section" id="how" className="border-b border-line-soft py-24 sm:py-32">
          <Container wide>
            <SectionMark
              no="01"
              label="How it works"
              title="Set it up once. It is ready for every interview after that."
              lede="Three steps, and none of them happen while someone is sitting in front of you."
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

            {/* The stage rail. */}
            <div className="mt-16 border-t border-line pt-16">
              <p className="mono text-[13px] uppercase tracking-[0.2em] text-faint">
                What happens between them talking and you asking
              </p>

              <div className="relative mt-12">
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
                      <h4 className="mt-1.5 text-[15px] font-semibold text-ink">{title}</h4>
                      <p className="mt-1 text-[14px] leading-relaxed text-muted">{body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Container>
        </Reveal>

        {/* ══════════════════════════════════════════ 02 consent ════════ */}
        {/*
          Placed ahead of features and pricing because it is the thing a hiring
          lead has to be able to defend to HR — and the one claim here that is
          enforced in code rather than promised in copy.

          Checked against apps/desktop: InterviewSetup.jsx carries the checkbox
          and renders "Not approved — unused" until it is ticked;
          buildSystemPrompt() omits the RÉSUMÉ block entirely when it is not, and
          the prompt instead carries "You have NOT been given the candidate's
          resume … Do not speculate about their background."
        */}
        <Reveal as="section" id="consent" className="border-b border-line-soft bg-canvas py-24 sm:py-32">
          <Container wide>
            <div className="grid gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
              <div>
                <SectionMark
                  no="02"
                  label="Consent"
                  title="The candidate agreed, and the app checks."
                />
                <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted">
                  Any tool that reads a candidate’s CV into a model needs an answer to
                  “did they say you could?”. Ours is not a promise in a policy document.
                  It is a gate in the code, and it fails closed.
                </p>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
                  That is the difference between something you can put in front of your
                  HR team and something you use quietly and hope nobody asks about.
                </p>
              </div>

              <div className="space-y-6">
                {[
                  ['check',
                   'Ticked before anything is read',
                   'Setup asks you to confirm the candidate agreed their CV can be used. Until you do, the summary line reads “Not approved — unused”.'],
                  ['lock',
                   'Enforced where it cannot be bypassed',
                   'The gate lives in the prompt builder, not the interface. An unapproved CV is not greyed out or ignored later — the section is absent from the request, so no screen and no future feature can route around it.'],
                  ['ban',
                   'And it says so to the model',
                   'Without approval the prompt carries an explicit instruction not to speculate about the candidate’s background, so it cannot fill the gap with a guess.'],
                  ['file',
                   'Every claim carries its source',
                   // CORRECTION 2026-08-30: "or the company research" removed —
                   // no such feature exists. See the note on FEATURES above.
                   'Follow-ups drawn from the CV or the job description are tagged inline, so you can always see which part of a suggestion came from a document and which is just the question.'],
                ].map(([icon, title, body], i) => (
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

        {/* ═════════════════════════════════════════ 03 features ════════ */}
        <Reveal as="section" id="features" className="border-b border-line-soft py-24 sm:py-32">
          <Container wide>
            {/* PIVOT 2026-08-29: the title was "Built for the moment you are put
                on the spot." — written for the candidate under pressure. The
                reader is the interviewer now. */}
            <SectionMark
              no="03"
              label="Features"
              title="Built for the middle of a conversation."
              lede="You have three seconds to read it and get back to the person in front of you. Everything below is shaped by that."
            />

            <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <div
                  key={f.title}
                  className="stagger rounded-2xl border border-line bg-paper p-7 transition-all duration-300 hover:-translate-y-[3px] hover:border-line"
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
          </Container>
        </Reveal>

        {/* ════════════════════════════════════════ 04 platforms ════════ */}
        <Reveal as="section" id="platforms" className="border-b border-line-soft bg-canvas py-24 sm:py-32">
          <Container wide>
            {/* lede was: "It sits above the window rather than inside it, so the
                meeting tool does not matter. These are the ones we check each
                release." — see the note above PLATFORMS. */}
            <SectionMark
              no="04"
              label="Works with"
              title="Whatever the interview is running on."
              lede="It sits above the window rather than inside it, so it does not matter whether the interview is a call, a shared editor or an assessment portal. These are the ones we check each release."
              center
            />
          </Container>

          {/*
            Deliberately OUTSIDE the Container. A row that slides has to run off
            both edges of the SCREEN to read as continuous; clipped to max-w-6xl
            it would look like a box that happens to be animating. <Ticker /> is
            placed the same way, for the same reason.
          */}
          <div>
            {/*
              Mounted once, outside the row that duplicates its items. Teams and
              Webex are gradient logos, and their paint servers have to exist
              exactly once in the document — see the note in PlatformMarks.jsx.
              Renders nothing visible.
            */}
            <PlatformMarkDefs />

            {/*
              LOGOS 2026-08-30 (second pass): the card grid became one
              auto-scrolling line and the marks went 30px -> 48px. Eight cards at
              that size are far wider than any viewport, so the row scrolls
              instead of wrapping — reusing the copy ticker's marquee
              (`.ticker-row` in globals.css), which brings hover-to-pause and the
              reduced-motion stop with it.

              PLATFORMS is rendered TWICE. The keyframe translates by exactly
              -50%, so the second copy is what occupies the viewport at the
              moment the first wraps; drop it and the loop visibly jumps. The
              duplicate is aria-hidden so the list is announced once, and the
              grid's `stagger` is gone — a per-item entrance delay is invisible
              on a row that is already sliding.

              <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
              <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
                {PLATFORMS.map((p, i) => (
                  <div key={p.key} className="stagger bg-paper p-7" style={{ '--i': i }}>
                    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-canvas-2 text-ink-soft">
                      <PlatformMark name={p.key} size={30} />
                    </span>
                    <h3 className="text-[15px] font-semibold text-ink">{p.name}</h3>
                    <p className="mono mt-1.5 flex items-center gap-1.5 text-[12px] text-faint">
                      <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                      Supported
                    </p>
                  </div>
                ))}
              </div>
            */}
            <div
              className="mark-strip ticker relative mt-16 overflow-hidden"
              style={{
                maskImage:
                  'linear-gradient(90deg, transparent, #000 6rem, #000 calc(100% - 6rem), transparent)',
                WebkitMaskImage:
                  'linear-gradient(90deg, transparent, #000 6rem, #000 calc(100% - 6rem), transparent)',
              }}
            >
              <div className="ticker-row marks">
                {[...PLATFORMS, ...PLATFORMS].map((p, i) => (
                  <div
                    key={i}
                    aria-hidden={i >= PLATFORMS.length}
                    className="mx-3 flex shrink-0 items-center gap-5 rounded-2xl border border-line bg-paper py-6 pl-6 pr-9"
                  >
                    <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-canvas-2 text-ink-soft">
                      <PlatformMark name={p.key} size={48} />
                    </span>
                    <span className="whitespace-nowrap">
                      <span className="block text-[17px] font-semibold text-ink">{p.name}</span>
                      <span className="mono mt-1.5 flex items-center gap-1.5 text-[12px] text-faint">
                        <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                        Supported
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Container wide>
            <p className="mt-10 text-center text-[15px] text-muted">
              Not listed? If it runs in a window on macOS or Windows, it works.
            </p>
          </Container>
        </Reveal>

        {/* ═════════════════════════════════════════ 05 pricing ═════════ */}
        <Reveal as="section" id="pricing" className="scroll-mt-24 border-b border-line-soft py-24 sm:py-32">
          <Container wide>
            <SectionMark
              no="05"
              label="Pricing"
              title="Go unlimited, or pay by the hour."
              lede="One credit is one hour of interview time, counted a minute at a time. Use 30 minutes and the other 30 stay in your account."
              center
            />

            <div className="mt-16">
              <PricingPlans
                tiers={tiersForCurrency(currency)}
                packs={packsForCurrency(currency)}
                singlePack={single}
                signedIn={signedIn}
              />
            </div>

            {/* Reassurance, at the point the decision is actually made. */}
            <div className="mt-14 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 border-t border-line-soft pt-10 text-[13px] text-muted">
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
        </Reveal>

        {/* ══════════════════════════════════════════ 06 limits ═════════ */}
        {/*
          PIVOT 2026-08-29: every line below is a real property of the build — no
          scoring exists, nothing is persisted server-side beyond a request
          record, no audio is written to disk, and capture is microphone-only
          today (the loopback path is wired in the main process but no renderer
          code calls getDisplayMedia). Deliberately says nothing about the window
          being visible or hidden; see the note at the top of this file.
        */}
        <Reveal as="section" id="limits" className="border-b border-line-soft bg-canvas py-24 sm:py-32">
          <Container wide>
            <SectionMark
              no="06"
              label="What it does not do"
              title="The short list of things it will not help with."
              lede="Worth knowing before you pay for it rather than after."
            />

            <div className="mt-16 grid gap-x-12 gap-y-9 sm:grid-cols-2">
              {LIMITS.map(([title, body], i) => (
                <div key={title} className="stagger flex gap-3.5" style={{ '--i': i }}>
                  <Icon name="minus" size={17} className="mt-0.5 shrink-0 text-faint" />
                  <div>
                    <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Container>
        </Reveal>

        {/* ═════════════════════════════════════════════ faq ════════════ */}
        <Reveal as="section" className="border-b border-line-soft py-24 sm:py-32">
          <Container>
            <SectionMark label="Questions" title="Before you ask." />
            <div className="mt-14">
              <FaqAccordion items={FAQS} />
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
                <h2 className="hl mx-auto max-w-[19ch] text-[clamp(1.9rem,3.4vw,2.75rem)] text-paper">
                  Your next interview is already scheduled.
                </h2>
                {/* PIVOT 2026-08-29: was "Set it up in the time it takes to read
                    the job description again." — the candidate's job description. */}
                <p className="mx-auto mt-6 max-w-md text-[16px] leading-relaxed text-paper/60">
                  Ten free minutes on signup. Enough to run a real one and decide.
                </p>

                <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                  {/* <Button href="/signup" size="lg" className="bg-paper text-ink hover:bg-canvas-2"> */}
                  <Button href="/signup" size="lg" variant="inverse">
                    Create your account
                  </Button>
                  <a
                    href="/login"
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
      </main>

      <SiteFooter />
    </div>
  )
}
