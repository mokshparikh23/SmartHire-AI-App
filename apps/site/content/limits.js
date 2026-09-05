/*
  COPY RULES: see the banner at the top of app/layout.js — no impersonation,
  no concealment, no latency figure.

  SPLIT 2026-09-01: carved out of apps/web/app/page.jsx.

  It lives on /features rather than /how-it-works, which is a judgement worth
  recording: FEATURES and LIMITS are the same rhetorical device — a capability
  inventory, positive and negative — and the reader deciding whether to buy is
  on /features. Grounding is a claim about MECHANISM, same register as the steps
  and the stage rail, so it went the other way.
*/

/*
  PIVOT 2026-08-29: every line below is a real property of the build — nothing
  is persisted server-side beyond a request record, and no audio is written to
  disk. Deliberately says nothing about the window being visible or hidden; see
  the banner at the top of app/layout.js.

  CORRECTION 2026-08-30: the note here said capture was microphone-only and that
  no renderer code called getDisplayMedia. That is out of date — useVoice.js
  `acquire()` defaults to source 'system' and calls getDisplayMedia for the
  loopback tap, falling back to the microphone. The "does not join the call"
  line below is written against that: it hears the machine's audio, which is not
  the same as being in the meeting, and nothing in the build joins one.
*/
/*
  CONCEPT 2026-08-30: the interviewer-side list, kept per the convention here.
  Three of the six were true of the build regardless of which chair the reader is
  in and are carried over unchanged.

  ['It does not score anyone', 'There is no rating, no rubric and no recommendation. …'],
  ['It does not join the call', 'It listens through your microphone, so the candidate needs to be audible in your room …'],
  ['It does not replace the interviewer', 'It is wrong sometimes, and it says so …'],
*/
export const LIMITS = [
  ['It does not speak for you',
   'No voice, no first person, no script. It answers the question and hands you the substance; saying it is yours to do, in your own words.'],
  ['It does not know anything you did not give it',
   'No web access, no company research, no memory of your last interview. Your CV, the job description, and what was just said in the room — that is the whole of it.'],
  ['It does not join the call',
   'It listens to your machine’s audio or your microphone. Nothing is added to the meeting, there is no Zoom or Teams integration, and no other participant appears.'],
  ['It is not private to your machine',
   'The resume text, the job description and every transcribed line go to our server and on to OpenAI. Uploaded PDFs are read locally and the file never leaves, but its text does.'],
  ['It does not record the call',
   'No audio is written to disk and no recording is produced. It transcribes to get at the words, and keeps none of it.'],
  ['It is wrong sometimes',
   'And it says so — what it cannot support from your CV or the job description it flags rather than asserts. Read the line before you say it out loud.'],
]
