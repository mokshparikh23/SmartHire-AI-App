/*
  COPY RULES: see the banner at the top of app/layout.js — no impersonation,
  no concealment, no latency figure.

  SPLIT 2026-09-01: this was `const TABS` inside components/DesiMode.jsx, and
  the intention was to leave it there — the measured min-h table in that file
  describes this copy and that layout together, and splitting them orphans the
  table from the thing it measures.

  IT HAD TO MOVE ANYWAY, and the reason is worth writing down because it is not
  obvious and it fails at RUNTIME rather than at build:

    DesiMode.jsx is 'use client'. When a Server Component imports from a client
    module, the import is replaced by a client-reference proxy — the module is
    not evaluated on the server at all. So `import { TABS } from '../DesiMode'`
    in a server-rendered page yields a stub, and the first property access on it
    throws. The landing page renders one of these tabs as a static sample, and
    that is exactly the 500 it produced.

  So the copy lives here, in a plain module both sides can read, and DesiMode
  imports it like any other content. THE MEASURED min-h TABLE STAYS IN
  DesiMode.jsx, next to the elements it constrains — and its warning applies to
  this file: change the copy below and those floors have to be re-measured, not
  guessed and not deleted.

  DESI-MODE 2026-08-30: framed as REGISTER and nothing else — plain, direct
  English instead of textbook formality. Not "sounds human, not AI", and not
  "undetectable". styleBlock() in systemPrompt.js refuses that outright, and
  copy here that promised it would be selling software that does not exist.
*/
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
export const TABS = [
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
