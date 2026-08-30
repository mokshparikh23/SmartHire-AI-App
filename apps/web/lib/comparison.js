/**
 * The comparison page's data. What the other AI interview tools cost, what they
 * do, and — the point of the page — which side of the table each one sits on.
 *
 * ─────────────────────────────────────────────────────────── PROVENANCE
 *
 * COMPETITOR figures are SECOND-HAND. Every one of them was read off a published
 * comparison table at chiku-ai.in/affordable-interview-assistants on the date in
 * SOURCE_DATE. None of it was checked against the vendors' own pricing pages,
 * and no number here was estimated, converted or filled in to make a row look
 * complete: where the source did not give a figure, the cell says so.
 *
 * That is why `sourceUrl` and `SOURCE_DATE` are rendered on the page rather than
 * kept as a code comment. A competitor comparison with undated prices is a claim
 * about someone else's business that nobody can check, and these prices move.
 *
 * TODO before this page carries any weight in a sales conversation: re-read each
 * vendor's pricing page, replace the values below with what THEY publish, and
 * move SOURCE_DATE forward. Second-hand is enough to orient a visitor; it is not
 * enough to argue with.
 *
 * OUR OWN column is first-hand and every cell is checked against the code:
 *
 *   Real-time responses    useInterviewSession.js streams the reply as it lands
 *   Answers the question   systemPrompt.js answerPrompt(), answerMode 'answer'
 *   Also suggests asks     the same file's followups branch, switched in the ⋮ menu
 *   Never in your voice    the first-person rules are commented out at that file's head
 *   Screen capture         askAboutScreen() → captureScreen() → image_url part
 *   Live transcription     useVoice.js acquire('system' | mic) → Whisper
 *   Résumé context         /api/resume/parse, gated in buildSystemPrompt()
 *   No practice mode       nothing in apps/desktop runs without a live session
 *   Credits never expire   lib/pricing.js, and the FAQ on the landing page
 *   Pay-per-use            CREDIT_PACKS exist alongside SUBSCRIPTION_TIERS
 *   Free to try            supabase signup trigger grants 10 minutes
 *
 * Prices for our own column are NOT in this file. They come from lib/pricing.js
 * through the page, because that is the only place prices are allowed to live —
 * a second copy here is how the comparison page and checkout start disagreeing.
 */

/** When the competitor figures below were read. Rendered on the page. */
export const SOURCE_DATE = '30 August 2026'

export const SOURCE_LABEL = 'chiku-ai.in'
export const SOURCE_URL = 'https://chiku-ai.in/affordable-interview-assistants'

/*
  ─────────────────────────────────────────────────────────────────── columns

  `side` says who a product is for: 'answering' is a tool for the person being
  interviewed, 'asking' is a tool for the person conducting the interview.

  CONCEPT 2026-08-30: ours was 'asking', and the four-against-one split was the
  whole argument of the page. It is 'both' now, and that is not a marketing
  hedge — apps/desktop ships two prompts and a menu that switches between them.
  answerMode 'answer' runs answerPrompt(), which answers the question that was
  heard; 'followups' runs the interviewer prompt, which suggests what to ask
  next. Same binary, same licence. If either mode is ever removed, this field is
  the first thing that has to change.

  What the page can no longer do is win on category. Four of these do the same
  job we do, so the honest argument is now price, terms, and what each one will
  and will not claim to be — which is what the rows below were rewritten around.
*/
export const US = 'smarthire'

export const COLUMNS = [
  {
    key: US,
    name: 'Smart Hire AI',
    // side: 'asking',
    // tagline: 'Suggests what to ask next',
    side: 'both',
    tagline: 'Answers the question you were asked',
    /* Price comes from lib/pricing.js at render time — see the note above. */
    priceNote: 'one hour, no subscription',
    us: true,
  },
  {
    key: 'parakeet',
    name: 'Parakeet AI',
    side: 'answering',
    tagline: 'Answers for the candidate',
    // The source listed both currencies for this one.
    price: { INR: '₹2,650', USD: '$29.50' },
    priceNote: 'for 3 credits',
  },
  {
    key: 'finalround',
    name: 'Final Round AI',
    side: 'answering',
    tagline: 'Answers for the candidate',
    price: { INR: '₹8,188', USD: '$90' },
    priceNote: 'per month',
  },
  {
    key: 'lockedin',
    name: 'LockedIn AI',
    side: 'answering',
    tagline: 'Answers for the candidate',
    // Source gave ₹ only. Deliberately NOT converted: the implied rate from the
    // two rows above is ~91/USD, and quoting "≈ $68" from that arithmetic would
    // be our number presented as theirs.
    price: { INR: '₹6,213', USD: null },
    priceNote: 'per month',
  },
  {
    key: 'warmup',
    name: 'Interview Warmup',
    side: 'answering',
    tagline: 'Solo practice, not live',
    price: { INR: 'Free', USD: 'Free' },
    priceNote: 'limited features',
  },
]

export const COMPETITORS = COLUMNS.filter(c => !c.us)

/**
 * A competitor's price in the visitor's currency, or the currency the source
 * actually listed it in.
 *
 * `listedInInr` is what stops this lying by omission. A US visitor reading
 * "₹6,213" beside "$29" needs to be told why one of them is in rupees; the flag
 * lets the cell say so instead of silently mixing units.
 */
export function competitorPrice(column, currency) {
  const own = column.price?.[currency]
  if (own) return { display: own, listedInInr: false }
  return { display: column.price?.INR ?? '—', listedInInr: currency !== 'INR' }
}

/*
  ────────────────────────────────────────────────────────────────────── rows

  Cell values are one of:

    'yes'      supported
    'no'       not supported
    'partial'  supported with a real caveat — the caveat goes in `notes`
    'na'       the question does not apply to that product
    'unknown'  the source did not say, and we did not guess

  Anything else is rendered as literal text. 'unknown' exists so the table can
  admit a gap; the alternative is a tick or a cross that nobody checked, which is
  the failure mode of every comparison page on the internet.

  `notes` hangs a one-line qualifier under a cell. It is used sparingly and only
  where a bare mark would overstate — the two 'partial' marks in our own column
  are both there because the honest answer is "yes, but not the way you think".
*/
/*
  CONCEPT 2026-08-30: the first group used to be "Which side of the table", and
  it was the page's argument — four for the candidate, one for the interviewer.
  Ours answers for the candidate now, so that group would be four identical
  cells and a row that says nothing. It is kept here per the convention in this
  repo, and replaced below by the rows that still separate these products.

  Note what was quietly wrong with it even then: three competitor cells asserted
  "writes in the candidate's voice: yes" and three asserted "meant to be
  disclosed: no". Neither was in the cited source. They were inferences about
  someone else's product presented as findings, and they are not carried into the
  new group — where we do not know, the cell now says so.

  {
    title: 'Which side of the table',
    lede: 'The rows most likely to end your visit early. …',
    rows: [
      { label: 'Who it is built for', values: { [US]: 'The interviewer', parakeet: 'The candidate', … } },
      { label: 'Suggests questions to ask', values: { [US]: 'yes', … }, notes: { [US]: 'Two or three after every answer, strongest first' } },
      { label: 'Writes answers in the candidate’s voice', values: { [US]: 'no', parakeet: 'yes', finalround: 'yes', lockedin: 'yes', warmup: 'no' }, notes: { [US]: 'The prompt forbids speaking as anyone' } },
      { label: 'Meant to be disclosed to the other person', values: { [US]: 'yes', parakeet: 'no', … }, notes: { warmup: 'Nobody else is in the room' } },
      { label: 'Consent gate enforced in code', values: { [US]: 'yes', parakeet: 'unknown', … }, notes: { [US]: 'No tick, no résumé in the prompt' } },
    ],
  },
*/
/**
 * The one row whose value depends on how this deployment is configured rather
 * than on what was read off a page or out of the code. Filled in by
 * featureGroupsFor() at the bottom of this file.
 *
 * Exported, and DECLARED ABOVE FEATURE_GROUPS rather than beside the function
 * that consumes it: the array below uses it as a `label`, and a `const` is in
 * the temporal dead zone until its own declaration runs. Declared after, this
 * would be a ReferenceError the moment anything imported this module.
 *
 * It is a join key, not a label that happens to match, which is why both ends
 * read the same constant instead of retyping the string.
 */
export const UPI_ROW = 'UPI / net banking'

export const FEATURE_GROUPS = [
  {
    title: 'What it puts on your screen',
    lede:
      'All five are pointed at the same moment — a question has just been asked ' +
      'and you have a few seconds. What arrives is where they start to differ.',
    rows: [
      {
        label: 'Answers the question you were asked',
        values: {
          [US]: 'yes', parakeet: 'yes', finalround: 'yes', lockedin: 'yes', warmup: 'no',
        },
        notes: {
          [US]: 'Answer on the first line, one sentence behind it',
          warmup: 'Practice questions, reviewed afterwards',
        },
      },
      {
        // True and checkable: answerMode 'followups' ships in the same binary and
        // is switched from the ⋮ menu. It is the only row here we win outright,
        // and it is a leftover capability rather than a headline — which is
        // roughly how the page should treat it.
        label: 'Also suggests questions to ask',
        values: {
          [US]: 'yes', parakeet: 'no', finalround: 'no', lockedin: 'no', warmup: 'no',
        },
        notes: { [US]: 'A second mode, for when you are the one interviewing' },
      },
      {
        /*
          OUR CELL IS THE ONE CHECKED CLAIM ON THE PAGE, so it stays exact. The
          first-person instructions were removed from systemPrompt.js in the pivot
          and are kept commented at the top of that file as evidence;
          styleBlock() closes by refusing to hide what it is. The other four are
          'unknown' deliberately — see the note above this array. We are not
          characterising anyone else's product from their marketing.
        */
        label: 'Writes the line in your voice, to read out',
        values: {
          [US]: 'no',
          parakeet: 'unknown', finalround: 'unknown', lockedin: 'unknown', warmup: 'unknown',
        },
        notes: { [US]: 'It answers; putting it in your words is yours' },
      },
      {
        label: 'Says it is an AI if asked outright',
        values: {
          [US]: 'yes',
          parakeet: 'unknown', finalround: 'unknown', lockedin: 'unknown', warmup: 'unknown',
        },
        notes: { [US]: 'Written into the prompt, not left to chance' },
      },
      {
        label: 'Tags which claim came from your CV',
        values: {
          [US]: 'yes',
          parakeet: 'unknown', finalround: 'unknown', lockedin: 'unknown', warmup: 'unknown',
        },
        notes: { [US]: '[resume] and [JD], inline, next to the detail' },
      },
    ],
  },
  {
    title: 'In the interview',
    lede: 'What each one actually does once the call has started.',
    rows: [
      {
        label: 'Real-time AI responses',
        values: {
          [US]: 'yes', parakeet: 'yes', finalround: 'yes', lockedin: 'yes', warmup: 'no',
        },
      },
      {
        label: 'Live audio transcription',
        values: {
          [US]: 'yes', parakeet: 'yes', finalround: 'yes', lockedin: 'yes', warmup: 'yes',
        },
        notes: { [US]: 'Microphone or the call’s own audio' },
      },
      {
        label: 'Screen capture analysis',
        values: {
          [US]: 'yes', parakeet: 'yes', finalround: 'yes', lockedin: 'yes', warmup: 'no',
        },
      },
      {
        /*
          CORRECTION 2026-08-30: this shipped as 'partial', noted "Tells you what
          to probe. It does not write the solution." Both halves were false, and
          the second was a claim about a restriction that does not exist anywhere
          in the build.

          What the code actually does. askAboutScreen() captures the screen and
          sends it as a [SCREENSHOT] turn, and BOTH prompt branches answer it:
          the followups prompt's own [SCREENSHOT] rule is "the interviewer asking
          about the attached image of their screen. Answer the question about
          what is in the image", with no instruction to withhold a solution —
          AnswerPanel.jsx says the same thing in its comment. On top of that,
          answerMode is user-selectable and its 'answer' setting swaps in
          answerPrompt(), which is a general live assistant: "If it is a
          question, answer it: directly, correctly."

          So a screenshot of a shared editor gets solved, and nothing stops it.
          This row is a plain yes, and it matches the other four — which is fine.
          The page's argument does not rest on this row, and pretending to a
          limit the software does not have is how a comparison page gets caught.

          If a real limit is ever wanted here, it belongs in the [SCREENSHOT]
          branch of the followups prompt in apps/desktop/src/services/
          systemPrompt.js — not in this file.

          values: { [US]: 'partial', ... },
          notes:  { [US]: 'Tells you what to probe. It does not write the solution.' },
        */
        label: 'Coding interview support',
        values: {
          [US]: 'yes', parakeet: 'yes', finalround: 'yes', lockedin: 'yes', warmup: 'partial',
        },
        notes: { [US]: 'Screenshot the shared editor and ask — it answers' },
      },
      {
        label: 'Résumé upload and context',
        values: {
          [US]: 'yes', parakeet: 'yes', finalround: 'yes', lockedin: 'yes', warmup: 'partial',
        },
        // notes: { [US]: 'Only after the consent box is ticked' },
        notes: { [US]: 'Your own CV, once you tick that it can be used' },
      },
      {
        /*
          CONCEPT 2026-08-30: this slot held "Scores or ranks the candidate",
          which was ours to be proud of when the reader was the interviewer and is
          meaningless now. It is replaced by the row we plainly lose — there is no
          practice mode anywhere in apps/desktop. Pricing advertised "unlimited
          mock interviews" for a while without one existing; that string is gone
          from lib/pricing.js and PricingPlans.jsx as of 2026-08-30, and this
          cell is what stops it coming back by the side door.

          { label: 'Scores or ranks the candidate', values: { [US]: 'no', parakeet: 'na', … } },
        */
        label: 'Practice rounds before the day',
        values: {
          [US]: 'no',
          parakeet: 'unknown', finalround: 'unknown', lockedin: 'unknown', warmup: 'yes',
        },
        notes: {
          [US]: 'Live interviews only. There is no mock mode.',
          warmup: 'That is the whole product',
        },
      },
    ],
  },
  {
    title: 'Buying it',
    lede: 'Prices move. The date under the table is the date these were read.',
    rows: [
      {
        label: 'Credits never expire',
        values: {
          [US]: 'yes', parakeet: 'yes', finalround: 'no', lockedin: 'yes', warmup: 'na',
        },
      },
      {
        label: 'Pay-per-use option',
        values: {
          [US]: 'yes', parakeet: 'yes', finalround: 'no', lockedin: 'no', warmup: 'na',
        },
        notes: { [US]: 'Billed by the minute, not the session' },
      },
      {
        /*
          RAZORPAY 2026-08-30: OUR CELL IN THIS ROW IS NOT WRITTEN HERE.

          It used to be a flat 'partial' with the note "Cards via Stripe; UPI
          depends on the Stripe account", because checkout named no payment
          methods and this repo could not see the Stripe dashboard. Razorpay
          landed since, and INR checkout now routes to it — UPI, net banking and
          cards — but only once RAZORPAY_KEY_ID is actually set on the
          deployment. Until then gatewayFor() falls back to Stripe and the honest
          answer is still "cards".

          So the cell is filled in by featureGroupsFor() below, from the same
          function checkout routes on. A page whose argument is "we checked"
          cannot have a payment claim that is true on one deployment and false on
          another, and this is the only row where that was possible.

          values: { [US]: 'partial', … },
          notes:  { [US]: 'Cards via Stripe; UPI depends on the Stripe account' },
        */
        label: UPI_ROW,
        values: {
          parakeet: 'yes', finalround: 'no', lockedin: 'no', warmup: 'na',
        },
      },
      {
        /*
          COMPLIANCE — read before editing. Our cell states what the CODE does:
          checkout passes no `automatic_tax` and no `tax_rates`, so the listed
          amount is the amount charged and no tax line is added. That is a
          description of the build, NOT tax advice and NOT a claim that no GST is
          due. If Smart Hire AI registers for GST, this row and the prices on the
          landing page both have to change together.
        */
        label: 'Tax added at checkout',
        values: {
          [US]: 'Listed price, nothing added',
          parakeet: 'GST on UPI only',
          finalround: 'Priced in USD',
          lockedin: 'GST may apply',
          warmup: 'na',
        },
      },
      {
        label: 'Free to try',
        values: {
          [US]: '10 minutes, no card',
          parakeet: 'unknown', finalround: 'unknown', lockedin: 'unknown',
          warmup: 'Free throughout',
        },
      },
      {
        label: 'Best for',
        values: {
          // [US]: 'Interviewers and hiring teams',
          [US]: 'A run of interviews, paid by the hour',
          parakeet: 'Frequent users',
          finalround: 'Corporates',
          lockedin: 'Power users',
          warmup: 'Free practice',
        },
      },
    ],
  },
]

/**
 * FEATURE_GROUPS with our payment cell filled in from live configuration.
 *
 * `upiLive` comes from gatewayFor('INR') in the page — the SAME function
 * app/api/checkout/route.js routes on — so the table and the checkout it
 * describes cannot disagree. Set the Razorpay keys and the row becomes a tick on
 * the next request; leave them unset and it stays an honest caveat.
 *
 * Deliberately a pure transform rather than a mutation of FEATURE_GROUPS: this
 * runs per request on a server component, and a module-level array quietly
 * rewritten by the first render is a cache bug waiting to be blamed on Next.
 */
export function featureGroupsFor({ upiLive }) {
  return FEATURE_GROUPS.map(group => ({
    ...group,
    rows: group.rows.map(row =>
      row.label !== UPI_ROW ? row : {
        ...row,
        values: { ...row.values, [US]: upiLive ? 'yes' : 'partial' },
        notes: {
          ...row.notes,
          [US]: upiLive
            ? 'UPI, net banking, cards and wallets, via Razorpay'
            : 'Cards only — the UPI gateway is not switched on yet',
        },
      },
    ),
  }))
}

/** Legend under the table. Order matches how often a reader will meet them. */
export const LEGEND = [
  ['yes',     'Supported'],
  ['no',      'Not supported'],
  ['partial', 'With a caveat — see the line under the mark'],
  ['unknown', 'The source did not say, and we did not guess'],
  ['na',      'Does not apply to that product'],
]
