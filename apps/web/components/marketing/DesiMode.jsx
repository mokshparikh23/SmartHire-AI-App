'use client'

import { Fragment, useState } from 'react'
import Icon from '@/components/ui/Icon'
import PillTabs from '@/components/ui/PillTabs'
import { Badge } from '@/components/ui'

/*
  DESI-MODE 2026-08-30

  The register switch, as a comparison card. Ported from the reference design's
  layout — bordered card, a header with a NEW pill, a tab toggle, a boxed sample,
  two side-by-side panels with a ✗ and a ✓, and a row of outlined pills — and
  from none of its content or its colour.

  BOTH PANELS HOLD THE SAME ANSWER. Only the wording differs — that is what a
  register switch is, and it is the reason this card can exist without becoming
  a script. What it must never become is the reference's version of it, which
  compares a "robotic" answer with one that sounds more like a person: that is
  detection evasion dressed as tone, and styleBlock() in
  apps/desktop/src/services/systemPrompt.js refuses it in as many words ("never
  hide or deny what you are. Asked directly, say plainly that you are an AI
  assistant"). Plain is about being readable in three seconds, not about passing
  for something.

  CONCEPT 2026-08-30: the panels used to hold a follow-up for the interviewer to
  ask. They hold an answer now, because the product answers the question the
  interviewer asked. The card's argument did not change with it — a formal
  sentence you have to rewrite in your head is useless mid-answer whichever chair
  you are in.

  THE TABS ARE NOT INVENTED. "Answer first", "When you do not know" and "From
  your CV" are three rules out of answerPrompt() in that same file — the WHAT TO
  RETURN line ("Lead with the answer"), and two bullets from ACCURACY ("If you do
  not know, say so in one line"; "Cite [resume] or [JD] inline"). Taking the
  categories from the shipped prompt rather than writing marketing ones is what
  stops this card drifting away from the product the way the pre-pivot copy did —
  if that prompt is edited, this section is stale.

  ON REGISTER, NOT DIALECT. Desi Mode is plain, direct Indian English: the way
  the answer would actually be said in the room. It is not Hinglish, not a
  translation and not a performance of an accent, and the copy below deliberately
  contains no dialect markers — no "kindly", no "do the needful", no "only" or
  "itself" as intensifiers. Adding some would turn a register feature into a
  caricature. The first entry in PROOF says so on the page so nobody has to ask.
*/

/* A nested array inside `desi` is a highlighted phrase.

   Trailing punctuation belongs INSIDE the phrase it follows, and that is not a
   style preference — <mark> carries px-1, so a comma left outside sits a padding
   width away from the word it attaches to and renders as "measured it ." with a
   visible space. Caught in the browser at 375 and 1280. Keep the comma or full
   stop inside the bracket whenever a highlight runs up to one. */
/*
  CONCEPT 2026-08-30: the interviewer-side tabs, kept per the convention in this
  repo. Their categories came from WHAT MAKES A GOOD FOLLOW-UP; the ones below
  come from answerPrompt(), for the same reason.

  const TABS = [
    {
      key: 'vague',
      label: 'Vague claim',
      heard: '“The migration went pretty smoothly, and performance improved a lot once we shipped it.”',
      formal: 'Could you elaborate on the performance improvements you observed, and describe the methodology by which they were measured?',
      desi: [
        '“Improved a lot” — ', ['how much exactly?'], ' Ask for ',
        ['the number before and after,'], ' and ', ['who measured it.'],
      ],
      wrong: 'Nobody asks a question like that out loud. You would rewrite it in your head first, and by then the moment has gone.',
      right: 'Reads in one pass. The number that is missing is the whole question.',
    },
    {
      key: 'who',
      label: 'Who did what',
      heard: '“We rebuilt the payments service end to end. I drove most of that with the platform team.”',
      formal: 'It would be helpful to understand the delineation of responsibilities between yourself and the platform team on that initiative.',
      desi: [
        'They said ', ['“we”, then “I”.'], ' Ask ', ['what they decided themselves,'],
        ' and ', ['what the platform team decided.'],
      ],
      wrong: 'It clears its throat for a full line before it asks anything. You will not finish reading it before the candidate has moved on.',
      right: 'Two plain questions, and you can ask them exactly as they are written.',
    },
    {
      key: 'broke',
      label: 'What went wrong',
      heard: '“It was a clean rollout. No major incidents, and the team was happy with how it went.”',
      formal: 'Were there any unanticipated challenges encountered during the rollout that you would highlight in retrospect?',
      desi: [
        ['A clean rollout is rare.'], ' Ask ', ['what broke,'],
        ' even something small, and ', ['what they changed afterwards.'],
      ],
      wrong: '“Any unanticipated challenges” invites a no. The politeness is doing the candidate’s work for them.',
      right: 'Assumes something broke, so the honest answer becomes the easy one to give.',
    },
  ]
*/
const TABS = [
  {
    key: 'lead',
    label: 'Answer first',
    heard: '“How would you keep a payments API idempotent when the client retries after a timeout?”',
    formal: 'There are a number of considerations at play, and it may be helpful to begin by outlining the general landscape of retry semantics before addressing idempotency itself.',
    desi: [
      'The client sends an ', ['idempotency key.'], ' Store it ',
      ['with the result,'], ' and on a retry ', ['return what you stored.'],
    ],
    wrong: 'Thirty words of throat-clearing before the answer starts. You are still reading the wind-up while they wait.',
    right: 'The answer is the first thing on the line, so you can start talking straight off it.',
  },
  {
    key: 'unsure',
    label: 'When you do not know',
    heard: '“What write throughput were you running on that cluster at peak?”',
    formal: 'Throughput in systems of that nature is typically governed by a range of factors, including replication configuration, batch size and the characteristics of the underlying storage.',
    desi: [
      ['Not sure of the exact figure'], ' — it was ', ['a few thousand writes a second'],
      ' across three nodes. ', ['Say you would have to check.'],
    ],
    wrong: 'It fills the gap with something that sounds like an answer. That is the one thing you cannot walk back when they follow up.',
    right: 'Honest about the number, useful about the shape. Nobody is caught out later.',
  },
  {
    key: 'cv',
    label: 'From your CV',
    heard: '“You mentioned a billing migration on your CV. What was your part in it?”',
    formal: 'I was engaged in a cross-functional capacity across the migration workstream, partnering with a number of stakeholders in order to deliver the intended outcome.',
    desi: [
      ['Four months on the payments team,'], ' and you owned ', ['the replay path.'],
      ' Then the number: ', ['p99 from 900ms to 210ms.'],
    ],
    wrong: 'Says nothing a hiring manager can check. “Cross-functional capacity” is what people say when they did not own it.',
    right: 'Two facts off your own CV, in the order they are worth saying.',
  },
]

/*
  Four marks, and each restates a boundary the prompt already enforces rather
  than making a new claim. No figure appears anywhere on this card: the page
  carries no latency number (see the note above STAGES in app/page.jsx), so
  "short enough to read mid-answer" is the un-numbered version of the prompt's
  "roughly three seconds".
*/
const PROOF = [
  ['globe',  'Plain English, not a translation'],
  ['clock',  'Short enough to read mid-question'],
  // ['check',  'You still choose what to ask'],
  // ['shield', 'The consent gate is unchanged'],
  ['check',  'You still say it in your own words'],
  ['shield', 'It never writes in your voice'],
]

export default function DesiMode() {
  const [key, setKey] = useState(TABS[0].key)
  const tab = TABS.find((t) => t.key === key) ?? TABS[0]

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_60px_-30px_rgba(0,0,0,0.16)]">
      {/* ── header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4 border-b border-line px-6 py-6 sm:px-8">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-canvas-2 text-ink">
          <Icon name="speech" size={19} />
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="hl text-[21px] text-ink">Desi Mode</h3>
            {/* `mono uppercase tracking-*` through className is safe and a colour
                would not be: none of those three shares a CSS property with the
                tone string (bg-ink / text-paper) or with the base (text-[11px] /
                font-medium), so there is no same-property collision for Tailwind
                to resolve by stylesheet order. That is exactly why `ink` is a
                TONE rather than a className here — see components/ui/index.jsx. */}
            <Badge tone="ink" className="mono uppercase tracking-[0.12em]">New</Badge>
          </div>
          {/* <p …>The same follow-ups, written in plain, direct Indian English.</p> */}
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
            The same answer, written in plain, direct Indian English.
          </p>
        </div>

        {/* Where the reference puts a collapse chevron. A landing-page card that
            IS the pitch for the feature has nothing to gain from being
            collapsible, and a control whose only effect is to hide the argument
            is worse than no control. The slot carries the locale tag instead,
            which fills it with information and quietly answers "is this Hindi?"
            before anyone has to ask. Written en-IN rather than EN-IN because it
            is a real BCP-47 tag and uppercasing it would stop it being one. */}
        <span className="mono ml-auto hidden shrink-0 pt-1.5 text-[11px] tracking-[0.14em] text-faint sm:block">
          en-IN
        </span>
      </div>

      {/* ── body ────────────────────────────────────────────────────────── */}
      <div className="px-6 py-7 sm:px-8">
        {/* Left-aligned, not centred like the pricing toggle: this section's
            SectionMark is left-aligned, and centring a flex row that overflows
            makes the first item unreachable on the left. Below sm the three
            pills are wider than the card, so the row scrolls — the negative
            margin lets it run to the card's edge rather than stopping short at
            the padding, and the card's own overflow-hidden clips it against the
            rounded corner rather than letting it push the page sideways. */}
        <div className="flex max-sm:-mx-6 max-sm:overflow-x-auto max-sm:px-6 max-sm:[scrollbar-width:none]">
          <PillTabs
            items={TABS.map((t) => [t.key, t.label])}
            value={key}
            onChange={setKey}
            label="Kind of answer"
            idBase="desi"
            panelId="desi-panel"
            compact
          />
        </div>

        {/* One tabpanel, not three: switching tabs replaces the quote AND both
            panels, so they are one region. tabIndex={0} because it holds nothing
            focusable and would otherwise be unreachable by keyboard; it picks up
            the site's :focus-visible ring from globals.css. */}
        <div
          id="desi-panel"
          role="tabpanel"
          tabIndex={0}
          aria-labelledby={`desi-tab-${tab.key}`}
        >
          {/* "Interviewer asked" rather than a new label: LiveDemo's left pane
              in the hero uses the same eyebrow, and the two frames should read
              as the same product looking at the same thing. */}
          <div className="mt-7 rounded-xl border border-line bg-canvas p-5">
            {/* <p className="eyebrow mb-2.5">Candidate said</p> */}
            <p className="eyebrow mb-2.5">Interviewer asked</p>
            {/* min-h so the card does not change height when a tab is clicked.

                EVERY NUMBER BELOW WAS MEASURED, not estimated, and each is the
                tallest the field gets across all three tabs at that breakpoint,
                plus a little headroom. Measured in a browser with the
                min-heights stripped, at 375 / 640 / 768 / 1024 / 1280:

                            375    640    768   1024+
                  heard    4.88   3.25   1.63   1.63   →  5em / sm 3.4em / lg 1.8em
                  body     9.75   9.75   8.13   4.88   →  9.9em / lg 5em
                  verdict  6.50   6.50   4.88   3.25   →  6.6em / lg 3.4em

                Note the narrowest text column is NOT mobile — at 640px each
                panel is ~224px against ~239px on a 375px phone — which is why
                `heard` steps down at sm while the panel fields hold until lg.

                THESE GO STALE WHEN THE COPY CHANGES. They were tuned for one set
                of TABS, the copy was then rewritten, and the card started
                jumping 23px between tabs at 375px because `body` outgrew an
                8.2em floor. If you edit TABS, re-measure — do not guess, and do
                not delete the floors instead. */}
            <p className="min-h-[5em] text-[15px] leading-relaxed text-ink sm:min-h-[3.4em] lg:min-h-[1.8em]">
              {tab.heard}
            </p>
          </div>

          {/* Equal columns, and NOT LiveDemo's `gap-px bg-line` hairline trick.
              That trick makes two panes of ONE block, and the whole point here
              is that the two panels carry different weight — an inert one and an
              active one — which needs separate borders and separate grounds. The
              treatment is lifted from Options in PricingPlans.jsx: border-ink
              plus a soft lift for the live one, border-line-soft on canvas for
              the one that is not. Equal widths because an unequal split would
              make the shorter desi text look shorter for the wrong reason.

              Below sm they stack, off above on: that order is the argument. */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col rounded-xl border border-line-soft bg-canvas p-5">
              <p className="eyebrow">Desi Mode off</p>
              {/* text-muted, not text-faint. The reference greys this panel right
                  out; at #a1a1aa on #faf9f7 that is about 2.5:1 and fails AA
                  outright. #71717a is about 4.7:1 and still reads as clearly the
                  quieter of the two next to the text-ink on the right. */}
              <p className="mt-3 min-h-[9.9em] text-[15px] leading-relaxed text-muted lg:min-h-[5em]">
                {tab.formal}
              </p>
              {/* mt-auto, and the two panels stretch to the taller of the pair,
                  so both hairlines land at the same y. Without it the ✗ rule and
                  the ✓ rule sit at different heights and the pair stops reading
                  as a comparison. */}
              <div className="mt-auto flex gap-2.5 border-t border-line-soft pt-4">
                <Icon name="close" size={14} className="mt-[3px] shrink-0 text-critical" />
                <p className="min-h-[6.6em] text-[13px] leading-relaxed text-muted lg:min-h-[3.4em]">
                  {tab.wrong}
                </p>
              </div>
            </div>

            <div className="flex flex-col rounded-xl border border-ink bg-paper p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              {/* `.eyebrow` sets colour in @layer components and `text-ink` is a
                  utility in @layer utilities, so the utility wins on layer order
                  alone — no specificity or stylesheet-order coin-flip involved.
                  That is a different mechanism from the Badge/Button className
                  trap, where both declarations are utilities of one property. */}
              <p className="eyebrow text-ink">Desi Mode on</p>
              <p className="mt-3 min-h-[9.9em] text-[15px] leading-relaxed text-ink lg:min-h-[5em]">
                {tab.desi.map((part, i) =>
                  Array.isArray(part) ? (
                    /* A real <mark>: this is highlighted text, and Tailwind's
                       preflight does not reset the element, so background and
                       colour are both set explicitly over the UA default.
                       box-decoration-clone keeps both fragments rounded when a
                       highlighted phrase wraps across a line — without it the
                       break end is a torn box.

                       The accent tint is the only colour on this card apart from
                       two 14px glyphs. The palette note in globals.css reserves
                       the accent for "links and small marks"; three short phrases
                       inside one panel is a small mark, and it is what makes the
                       right-hand panel read as the live one without importing
                       the reference's amber. The strictly monochrome fallback,
                       if that is judged too much, is `bg-canvas-2 text-ink` —
                       one class change, nothing else moves. */
                    <mark
                      key={i}
                      className="box-decoration-clone rounded bg-accent-soft px-1 py-px text-accent"
                    >
                      {part[0]}
                    </mark>
                  ) : (
                    <Fragment key={i}>{part}</Fragment>
                  ),
                )}
              </p>
              <div className="mt-auto flex gap-2.5 border-t border-line-soft pt-4">
                <Icon name="check" size={14} className="mt-[3px] shrink-0 text-positive" />
                <p className="min-h-[6.6em] text-[13px] leading-relaxed text-ink-soft lg:min-h-[3.4em]">
                  {tab.right}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── the four marks ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-t border-line px-6 py-5 sm:px-8 sm:py-6">
        {PROOF.map(([icon, text], i) => (
          <span
            key={text}
            className="stagger inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-[13px] text-muted"
            style={{ '--i': i }}
          >
            <Icon name={icon} size={15} className="text-faint" />
            {text}
          </span>
        ))}
      </div>
    </div>
  )
}
