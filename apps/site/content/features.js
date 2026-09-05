/*
  COPY RULES: see the banner at the top of app/layout.js — no impersonation,
  no concealment, no latency figure.

  SPLIT 2026-09-01: carved out of apps/web/app/page.jsx, where FEATURES was a
  module-level const in an 872-line file. It has two consumers now — the landing
  page shows three of these as a teaser, /features shows all six — which is why
  it is a module rather than a literal.

  Its siblings went to: steps.js, grounding.js, limits.js, platforms.js,
  faqs.js, pricing-marks.js.
*/

/*
  PIVOT 2026-08-29: every entry below described the covert CANDIDATE-side tool
  this app used to be.

  CORRECTION 2026-08-30: the note that stood here claimed setContentProtection
  "was deleted" and that systemPrompt.js already opened "You help the person
  CONDUCTING this job interview". Neither was true at the time — the pivot had
  happened in that file and nowhere else, so every feature below was fiction for
  a day. systemPrompt.js was rewritten on 2026-08-30 and the claims are now real.

  On screen capture: the desktop app still calls setContentProtection(true), so
  the panel is kept out of a screen share. This site makes no promise either way
  about that — not that it is hidden, and not that it is visible. What the window
  manager does is one thing; a marketing claim about it is another, and the two
  entries below that made one ("Invisible on screen", and the first line of the
  old FAQ) are why the landing page spent three days being corrected.

  { icon: 'mic',    title: 'Hears the question',   body: 'Captures the interviewer through your microphone and transcribes each question as it is asked.' },
  { icon: 'file',   title: 'Knows your resume',    body: 'Every answer is drawn from the experience you actually have. It never invents a project you did not work on.' },
  { icon: 'bolt',   title: 'Answers as you listen', body: 'Responses stream word by word, so the beginning is on screen before the question has finished landing.' },
  { icon: 'eye',    title: 'Invisible on screen',  body: 'The overlay is excluded from screen capture and screen sharing. Your interviewer sees your desktop, not the assistant.' },
  { icon: 'shield', title: 'Stays on your machine', body: 'Your resume and transcripts never leave your computer. Only the question text is sent to generate an answer.' },
  { icon: 'lock',   title: 'Nothing to configure', body: 'No API keys, no billing setup, no model wrangling. Your plan covers the AI cost.' },
*/
/*
  CONCEPT 2026-08-30: the interviewer-side features, kept per the convention in
  this repo.

  { icon: 'mic',    title: 'Hears the room',            body: 'Listens through your microphone and transcribes each exchange as it happens. Silence is ignored, so a pause costs you nothing.' },
  { icon: 'bolt',   title: 'Two or three things to ask', body: 'After every answer it gives you the follow-ups worth asking, strongest first, streamed as the candidate is still talking.' },
  { icon: 'eye',    title: 'Catches the vague answer',   body: 'When someone talks around a question it says so, and gives you the question that pins it down.' },
  { icon: 'file',   title: 'Says where it got that',     body: 'Anything drawn from the resume or the job description is tagged inline, [resume] or [JD]. If nothing supports a follow-up, it says “worth confirming” rather than inventing a detail.' },
  { icon: 'shield', title: 'Only with consent',          body: 'The resume is used only after you confirm the candidate agreed to it. The check sits in the prompt builder, not the interface, so nothing can route around it.' },
*/
export const FEATURES = [
  // Audio: useVoice.js acquire() defaults to source 'system' and falls back to
  // the microphone, so both halves of the first card are real. Do not upgrade
  // "the audio your machine is playing" into a claim about joining the call —
  // there is no meeting integration anywhere in the build.
  { id: 'hears',   icon: 'mic',    title: 'Hears the question',      body: 'Listens to the audio your machine is playing, or your microphone, and transcribes each question as it is asked. Silence is ignored, so a pause costs you nothing.' },
  { id: 'streams', icon: 'bolt',   title: 'Answers while they talk', body: 'The reply streams word by word as it is written, answer first — so the start of it is on screen before the question has finished landing.' },
  { id: 'cv',      icon: 'file',   title: 'Drawn from your own CV',  body: 'Paste your resume and the job description once. Anything taken from them is tagged inline, [resume] or [JD], so you can see which part of an answer is a fact about you.' },
  { id: 'screen',  icon: 'eye',    title: 'Reads the shared screen', body: 'A coding question in a shared editor: capture the screen and ask about it. It answers what is in the image rather than guessing from the transcript.' },
  // The "says so" half is answerPrompt()'s ACCURACY block, near enough verbatim:
  // "If you do not know, say so in one line. Never invent a fact, a number, a
  // date or a source." Keep this card honest — it is the one that makes the rest
  // of the page believable.
  { id: 'honest',  icon: 'shield', title: 'It does not make things up', body: 'If it does not know, it says so in one line instead of filling the gap. No invented numbers, no invented projects — those are the answers you cannot walk back two questions later.' },
  { id: 'nokeys',  icon: 'lock',   title: 'Nothing to configure',     body: 'No API keys, no billing setup, no model wrangling. Your plan covers the AI cost.' },
]

/*
  SPLIT 2026-09-01: which three the landing page shows.

  AN EXPLICIT ID LIST, NOT FEATURES.slice(0, 3). The three are a choice — the
  thing it does, the speed it does it at, and where the material comes from —
  and a slice would hide that choice behind array order, so reordering FEATURES
  for the /features grid would silently change the home page. This way the
  decision is visible in the diff.

  `id` was added to FEATURES above for exactly this. Nothing else reads it.
*/
export const HOME_FEATURES = ['hears', 'streams', 'cv']

/** The teaser three, in the order named above. */
export const homeFeatures = () =>
  HOME_FEATURES.map(id => FEATURES.find(f => f.id === id)).filter(Boolean)
