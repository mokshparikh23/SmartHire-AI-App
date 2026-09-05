/*
  COPY RULES: see the banner at the top of app/layout.js — no impersonation,
  no concealment, no latency figure.

  SPLIT 2026-09-01: carved out of the single FAQS array in
  apps/web/app/page.jsx, and split in two.

  Nine entries, not eight — "Do I need my own API key?" reads like a product
  question and is answered as a billing one ("your plan covers the AI cost"), so
  it sits with the buying set.

  A dedicated /faq route is the obvious later move once there are more than
  nine. Deferred, not forgotten — see the revised note below for what the home
  page shows in the meantime.
*/

/*
  SPLIT 2026-09-01 (revised) ─ THE HOME PAGE GETS A SHORT FAQ AFTER ALL.

  The first version of this file argued the landing page should have none:
  every answer here is checked against the shipped build, so there are no
  home-only questions to invent, and repeating three of them duplicates content
  and breaks Google's rule that a marked-up FAQ question must be visible on the
  page carrying the markup.

  The first half of that still holds — nothing below is invented for the home
  page, HOME_FAQ only re-presents four of the nine. The second half is handled
  by scope rather than by omission: if FAQPage JSON-LD is ever added, it goes on
  /how-it-works and /pricing ONLY, never on the home page. There is no such
  markup yet; this is the note that stops it being added in three places.

  What the omission actually cost was worse than the duplication: a landing page
  that answers none of the four questions every visitor arrives with reads as
  incomplete, which is how it was reported.

  SELECTED BY QUESTION TEXT, NOT BY SLICING. The four are a choice — what it is,
  whether it is free to try, what an hour costs, and where the words go — one
  from each thing a first-time reader is deciding. A .slice() would hide that
  behind array order and change silently when a question is added.
*/
export const HOME_FAQ_QUESTIONS = [
  'Does it answer as me?',
  'Is there a free trial?',
  'What exactly is a credit?',
  'Where does the transcript go?',
]

/*
  PIVOT 2026-08-29: three of the four below are no longer true.

  ['Can the interviewer see it?', 'No. The overlay is marked as excluded from screen capture, so it does not appear in Zoom, Meet, Teams or any recording — even when you share your entire screen.'],
  ['Where does my resume go?', 'It stays on your machine. When a question is asked, only the question and the context needed to answer it are sent for processing.'],
  ['Which platforms are supported?', 'macOS and Windows. One licence key activates the app, and your balance lives on your account — so it follows you to either machine.'],

  The first was written for a candidate hiding from their interviewer, which is
  not the product; it is replaced by the consent question, which is the
  commitment this app actually makes and enforces. The second was never
  accurate — resume text, the job description and every transcribed utterance
  are sent to our server and on to OpenAI; only PDF text extraction happens on
  the machine. The third was fine but under-specified the builds.
*/
/*
  CONCEPT 2026-08-30: the consent FAQ, kept per the convention in this repo. It
  was written for an interviewer using someone else's CV; the document in
  question is your own now, so the tick in setup is a control over your own
  file rather than a promise about a third party. What replaces it is the
  question people actually arrive with — whether the thing answers as you.

  ['Does the candidate have to agree to this?', 'For their resume, yes — and the app enforces it rather than trusting you to remember. …'],
*/

/** Questions about what the thing is and does. Rendered on /how-it-works. */
export const FAQ_PRODUCT = [
  ['Does it answer as me?', 'No, and it will not be talked into it. The prompt answers the question — it does not write in the first person, it does not produce a line for you to read out as your own, and asked directly whether it is an AI it says that it is. What you get is the substance: the answer first, then a sentence supporting it, tagged where it came from your CV. Putting it into your own words is your half of the job, and it is the half that has to sound like you.'],
  // ['Where does the transcript go?', '… which is what makes the suggestions possible. … wrong for your organisation …'],
  ['Where does the transcript go?', 'To our server and on to OpenAI, which is what makes the answers possible. Uploaded PDFs are read on your machine and the file itself is never sent, but the text in it is. We keep a record that a request happened — the account, the kind of request, and when — not the words. If that trade is wrong for you, this is not the right tool.'],
  ['Which platforms are supported?', 'macOS on Apple Silicon, and 64-bit Windows. One licence key activates either, and your balance lives on the account rather than the machine. Builds are not signed yet, so the first launch needs the usual override.'],
]

/** Questions about what it costs and how billing works. Rendered on /pricing. */
export const FAQ_BUYING = [
  ['What exactly is a credit?', 'One credit is one hour — 60 minutes — of live interview time, and it is spent a minute at a time while a session runs. A 25-minute interview costs 25 minutes and leaves the other 35 in your account for the next one. Nothing is deducted for setting up, and credits you buy never expire.'],
  // ['Subscription or credits?', '… Credits suit an occasional interviewer: …'],
  ['Subscription or credits?', 'A subscription is unlimited interview time for the length of the period. Credits suit someone with a handful of rounds coming up: you pay for the hours you actually use, there is nothing to cancel, and whatever you do not use stays in your account.'],
  ['What happens if I run out mid-interview?', 'The app warns you at five minutes and again at one, then ends the session when the balance reaches zero rather than running on time you have not bought. Top up and start again — there is nothing to reactivate. Subscribers never see this.'],
  ['Is there a free trial?', 'Every new account starts with ten free minutes — enough to run one real interview end to end before deciding.'],
  ['Can I cancel?', 'A subscription stops at the end of the period you have already paid for. Credits are not a subscription at all: you buy them once and spend them whenever you have a call.'],
  ['Do I need my own API key?', 'No. Your plan covers the AI cost. There is nothing to sign up for and nothing to paste into the app — the desktop app ships no API credential of any kind.'],
]

/**
 * The four on the landing page, in the order named in HOME_FAQ_QUESTIONS.
 *
 * Resolved from the two arrays above rather than being a third copy of the
 * text, so an answer edited on /pricing is the same answer on the home page.
 * Throws if a question is renamed without updating the list — a silent drop
 * would leave the home FAQ quietly one item shorter.
 */
export const HOME_FAQ = HOME_FAQ_QUESTIONS.map((q) => {
  const found = [...FAQ_PRODUCT, ...FAQ_BUYING].find(([question]) => question === q)
  if (!found) throw new Error(`HOME_FAQ: no question matching "${q}" — was it reworded?`)
  return found
})
