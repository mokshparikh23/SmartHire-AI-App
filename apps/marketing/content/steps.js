/*
  COPY RULES: see the banner at the top of app/layout.js — no impersonation,
  no concealment, no latency figure.

  SPLIT 2026-09-01: carved out of apps/dashboard/app/page.jsx. STEPS is read twice
  now — the landing page shows the three titles as a teaser and nothing else,
  /how-it-works shows them in full — and STAGES is read once, on /how-it-works,
  where it was promoted out of the "how it works" section into a numbered
  section of its own.
*/

/*
  PIVOT 2026-08-29: the old steps, kept for reference. Step 02 was written for
  the candidate hiding the app from their interviewer, and step 03 offered
  answers "in your own voice" — which systemPrompt.js explicitly forbids.

  { n: '01', title: 'Add your context', body: 'Paste your resume and the job description once. The assistant uses them to shape every answer it gives.' },
  { n: '02', title: 'Start the session', body: 'Open the overlay before your call. It listens for questions and stays hidden from anything you share.' },
  { n: '03', title: 'Read and speak',    body: 'Answers appear the moment a question is asked, in your own voice and grounded in your own experience.' },
*/
/*
  CONCEPT 2026-08-30: the interviewer-side steps, kept per the convention here.

  { n: '01', title: 'Set up the interview', body: 'Company and role, then the job description and the candidate’s CV if you have them. Three fields, and it remembers them between interviews.' },
  { n: '02', title: 'Get the go-ahead',     body: 'Tell the candidate a copilot is helping you, and tick the box confirming they agreed before their resume is used. Until you do, it is never sent.' },
  { n: '03', title: 'Ask better questions', body: 'Follow-ups appear while the candidate is still answering. You choose what to ask, what to ignore, and what to write down.' },
*/
export const STEPS = [
  { n: '01', title: 'Set up the interview', body: 'Company and role, then your CV and the job description you are interviewing against. Three fields, and it remembers them between interviews.' },
  { n: '02', title: 'Open it before the call', body: 'Pick the interview and start the session. It listens, and it stays quiet until an actual question is asked of you.' },
  { n: '03', title: 'Read it, then say it',    body: 'The answer is on screen while the question is still being asked. You read it and put it in your own words — it does not speak, and it is not you.' },
]

/*
  The stage rail. The reference version carried a timing against each stage
  (0.0s / 0.3s / 0.9s / 4.0s) as the headline promise of the whole page. Nobody
  has measured this app, so the stages are named and the numbers are left out —
  an invented latency is the easiest claim on a page like this to be caught on.
*/
/*
  CONCEPT 2026-08-30: the interviewer-side rail.

  ['They answer',        'The candidate is still talking. Nothing is asked of you yet.'],
  ['It becomes text',    'Whisper transcribes the exchange as it happens.'],
  ['Follow-ups arrive',  'Two or three, strongest first, streamed as they are written.'],
  ['You decide',         'Ask one, ignore the rest. It never speaks and never scores.'],
*/
export const STAGES = [
  ['They ask',        'The interviewer is mid-sentence. Nothing has been asked of you yet.'],
  ['It becomes text', 'Whisper transcribes the question as it is spoken.'],
  ['The answer lands', 'Streamed as it is written, the answer on the first line.'],
  ['You say it',      'In your own words. It never speaks, and it never claims to be you.'],
]

/*
  SPLIT 2026-09-01: the rail's only heading used to be a bare mono line above
  it — "What happens between them asking and you answering" — because it lived
  inside the "how it works" section and could not have a heading of its own.
  It is a numbered section now, so that line becomes its SectionMark title and
  the mono paragraph is retired.
*/
export const STAGES_TITLE = 'What happens between them asking and you answering'
