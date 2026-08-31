import { useSettingsStore } from '../store/settingsStore'
// SELF-VOICE 2026-08-31: captureSource lives in the session store, not settings.
// Read with getState() at call time, exactly as answerMode is — buildSystemPrompt
// runs once per request, so a mid-session source switch takes effect immediately.
import { useSessionStore } from '../store/sessionStore'

/*
  PIVOT 2026-08-30: this file was the last place the covert candidate-side
  product still lived. The marketing site was rewritten for the interviewer-side
  copilot back on 2026-08-29, but nothing under apps/desktop followed — so every
  claim on the site ("tells you what is worth asking next", "you are not the
  candidate", "only with consent") described software that did not exist, while
  the shipped binary did the opposite.

  The old prompt is kept below rather than deleted, per the convention in this
  repo. It is here as evidence of what changed, NOT as something to restore:

  - it opened "helping a candidate during a live job interview"
  - it generated the candidate's ANSWERS, in first person, by question type
  - "NEVER say 'As an AI...' or reveal you are an assistant"
  - "Always sound like the candidate is speaking in first person"

  Those last two are instructions to impersonate a person and conceal the tool
  from the other party. Do not re-add them.

  export function buildSystemPrompt() {
    const { interviewContext } = useSettingsStore.getState()
    const { company, role, resume, jobDescription } = interviewContext

    return `You are a real-time AI interview assistant helping a candidate during a live job interview.
  Respond only with the answer — no explanations about what you're doing.

  CANDIDATE PROFILE
  Company interviewing at : ${company}
  Role applying for       : ${role}

  RESUME:
  ${resume}
  ${jobDescription ? `\nJOB DESCRIPTION:\n${jobDescription}` : ''}

  HOW TO ANSWER EACH QUESTION TYPE

  1. INTRODUCTION / "Tell me about yourself":
     - Start with current role/background from resume
     - Highlight top 2-3 skills relevant to "${role}" at "${company}"
     - End with why excited about this opportunity
     - Keep it under 90 seconds (spoken), natural and confident

  2. TECHNICAL QUESTIONS (C++, DSA, System Design, OS, DBMS, etc.):
     - Give a clear, correct, concise answer
     - Use simple examples where helpful
     - If the topic is in the resume, reference that experience naturally
     - For coding questions, give the optimal approach with time/space complexity

  3. BEHAVIOURAL QUESTIONS ("Tell me a time when...", "How do you handle..."):
     - Use STAR format (Situation, Task, Action, Result)
     - Pull examples ONLY from the resume provided
     - Tie the answer back to the role at ${company}

  4. COMPANY-SPECIFIC QUESTIONS ("Why ${company}?", "What do you know about us?"):
     - Answer specifically about ${company} and the ${role} position
     - Connect their work/values to the candidate's background from resume

  5. SALARY / AVAILABILITY / OTHER:
     - Give a professional, confident answer

  RULES
  - NEVER say "As an AI..." or reveal you are an assistant
  - NEVER make up experience not in the resume
  - Keep answers interview-ready — clear, confident, not too long
  - If a question is unclear, give the most likely intended answer
  - Always sound like the candidate is speaking in first person`
  }
*/

/**
 * Builds the system prompt for whichever answer mode is selected.
 *
 * SYSTEM-AUDIO 2026-08-30: there are two now, and they are not variations on
 * each other — they address different readers and want different output.
 *
 *   'answer'    — answers the question that was heard. The reader is whoever
 *                 is running the app.
 *   'followups' — the interviewer-side copilot. The reader is the person
 *                 CONDUCTING the interview, and the output is questions for
 *                 them to ask, never an answer for anyone to read out.
 *
 * Neither mode writes in a candidate's voice or conceals what it is. That was
 * the covert prompt removed in the pivot, kept commented at the top of this
 * file as evidence; the notes there still apply.
 *
 * CONSENT GATE: the résumé is included only when `resumeConsent` is true. That
 * check lives here, in the prompt builder, rather than in the setup screen —
 * the UI can be skipped, re-rendered or worked around, but nothing reaches the
 * model without passing through this function. If the flag is false the résumé
 * text is simply absent from the prompt, so there is no path by which it
 * influences a suggestion. It gates BOTH modes: the branch below chooses
 * wording, never whether the document is present.
 */
export function buildSystemPrompt() {
  // const { interviewContext } = useSettingsStore.getState()
  // const { interviewContext, answerMode } = useSettingsStore.getState()
  const { interviewContext, answerMode, answerStyle } = useSettingsStore.getState()
  // CONTEXT 2026-08-31: candidateName, companyDomain and resumeBrief added. All
  // three were already fetched or already in the schema and simply never reached
  // the prompt — see the notes at each use below.
  // const { company, role, resume, jobDescription, resumeConsent } = interviewContext
  const {
    company, role, resume, jobDescription, resumeConsent,
    candidateName, companyDomain, resumeBrief,
  } = interviewContext
  // SELF-VOICE 2026-08-31: which audio is being captured decides whether the
  // model can trust who spoke a [HEARD] line.
  const { captureSource } = useSessionStore.getState()

  // Falsy-safe: a résumé that was pasted before consent was given must not leak
  // through on a stale flag, and an empty string must not produce a headed but
  // blank section that reads to the model as "no relevant experience".
  const useResume = resumeConsent === true && typeof resume === 'string' && resume.trim() !== ''
  const useJD = typeof jobDescription === 'string' && jobDescription.trim() !== ''

  /* CONTEXT 2026-08-31 ─ THE most important line in this change ────────────────
     The brief is a second projection of the same document, so it rides the SAME
     gate, in the SAME expression. Writing it as its own boolean is precisely how
     a consent gate gets quietly bypassed by the next field somebody adds. */
  const brief = useResume && typeof resumeBrief === 'string' ? resumeBrief.trim() : ''

  const sections = [
    /* CONTEXT 2026-08-31: the candidate's name was written on the dashboard,
       returned by /api/profiles and rendered in the launcher list, and then
       simply never copied into interviewContext — so the model never had it.

       It is deliberately NOT behind resumeConsent. In a candidate-side product
       this is the user's own name, in their own app, typed by them on their own
       dashboard. The résumé carries the name only under consent because the
       résumé is a document about them; their name is how they are addressed.
       Stated here so nobody "fixes" this in either direction by accident.

       It is also what makes [HEARD] and [SAID] unambiguous below. */
    // `INTERVIEW\nCompany : …\nRole    : …`,
    `INTERVIEW
Candidate : ${candidateName || 'not specified'}
Company   : ${company || 'not specified'}${companyDomain ? ` (${companyDomain})` : ''}
Role      : ${role || 'not specified'}`,
  ]

  if (useResume) {
    /* ADAPTIVE 2026-08-31: "when a FOLLOW-UP comes from it" is interviewer-side
       wording, and this block is shared by both modes — answer mode never
       produces follow-ups at all. Neutral phrasing, same meaning.

       The brief goes first because that is where a short follow-up gets
       resolved: "why did you leave?" finds the employer sequence in a handful of
       tokens instead of scanning four kilobytes of flattened prose. */
    // sections.push(`CANDIDATE RÉSUMÉ — … Cite it as [resume] when a follow-up comes from it.`)
    sections.push(`CANDIDATE RÉSUMÉ — the candidate has agreed to its use in this interview.
Cite it as [resume] when something you say comes from it.
${brief ? `
AT A GLANCE
${brief}

FULL TEXT` : ''}
${resume.trim()}`)
  } else {
    // ADAPTIVE 2026-08-31: "the INTERVIEWER has not confirmed" and "what is said
    // in the room" are both written from the other side of the table, and were
    // being sent to a candidate-side model. Same restriction, neutral wording.
    // sections.push(`You have NOT been given the candidate's resume. Either none was
    // supplied, or the interviewer has not confirmed the candidate agreed to its use. …`)
    sections.push(`You have NOT been given the candidate's résumé. Either none was supplied,
or consent for its use has not been confirmed. Do not speculate about their
background, do not ask for the résumé, and do not infer what might be in it.
Work only from what is actually said in this conversation.`)
  }

  if (useJD) {
    // ADAPTIVE 2026-08-31: same neutral wording as the résumé line above.
    // sections.push(`JOB DESCRIPTION — cite it as [JD] when a follow-up comes from it.`)
    sections.push(`JOB DESCRIPTION — cite it as [JD] when something you say comes from it.

${jobDescription.trim()}`)
  }

  /* SELF-VOICE 2026-08-31 ─ the mode with no speaker separation ────────────────
     On 'system' capture the two sides arrive on two different streams and the
     tags below are reliable. On a single room microphone they do not: both
     parties land on one stream, and the model was being told every line was
     "spoken by the other person" — so it would generate an answer to the
     candidate's own answer. Say what is actually true instead. */
  if (captureSource !== 'system') {
    sections.push(`CAPTURE — a single room microphone. A [HEARD] line may be either the
interviewer or the candidate, and there is no [SAID] channel in this mode. When
a line reads as an answer rather than a question, it is the candidate speaking:
treat it as context, do not answer it, and say "nothing to add".`)
  }

  const context = sections.join('\n\n')

  /*
    ANSWER-STYLE 2026-08-30: register is an axis, not a third mode.

    What the copilot is FOR is answerMode. How it words the result is
    answerStyle, and the two are independent — a plain follow-up and a plain
    answer are both things a user can want, so branching this into the mode
    switch would have needed four prompts to express two ideas.

    It is computed HERE, next to `context`, for the same reason `context` is:
    both branches below need it and neither may see a different one. Note what
    it is NOT given. `useResume` and the sections array are already assembled
    above and are not passed to it. The consent gate decides what the model is
    TOLD; this decides only how the model words what it says back.
  */
  const style = styleBlock(answerStyle)

  // if (answerMode !== 'followups') return answerPrompt(context)
  //
  // ANSWER-STYLE 2026-08-30: the test is inverted along with the default. With
  // 'followups' shipping as the default, `!== 'followups'` made any value the
  // store did not recognise — a hand-edited blob, a value from a build that has
  // not been written yet — fall through to 'answer'. Falling back to whatever is
  // currently the default is the rule at both ends now; setAnswerMode does the
  // same on the way in.
  if (answerMode === 'answer') return answerPrompt(context, style)

  return `You are a copilot for the person CONDUCTING this job interview.

You are not the candidate and you never speak for them. You do not write
answers for anyone to read out. You suggest what the interviewer should ask
next.

${context}

WHAT TO RETURN

Every message begins with a tag saying where it came from. Read it first — it
decides what kind of reply is wanted, and the three are not interchangeable.

[HEARD] — a line transcribed from the captured audio, spoken by the candidate.
   Give two or three follow-up questions, strongest first. Nothing else: no
   preamble, no summary of what was said, no commentary on how the interview is
   going. Do NOT greet, and do not answer it as though it were addressed to you
   — it was not.

[TYPED] — the interviewer typing to you directly. Answer what they
   actually asked, briefly and in plain language. If they say hello or ask what
   you can do, reply like a normal assistant in one short line; do not turn it
   into interview follow-ups. If the honest answer IS a set of questions to ask,
   give those; if they asked something else — what a term means, whether a claim
   is plausible, what to look for in a code sample — answer that instead of
   forcing it into follow-up shape.

[SCREENSHOT] — the interviewer asking about the attached image of their screen.
   Answer the question about what is in the image.

Either way: short lines, readable at a glance mid-conversation. One sentence of
reasoning, then the question. Keep a reply under about 60 words unless they
asked for detail. They have roughly three seconds to read it.

LANGUAGE

The candidate may speak English, Hindi, Gujarati, Hinglish, or two of them in
one sentence, in Latin, Devanagari or Gujarati script. Read all of them.

Write every follow-up in English. The interviewer reads English, and asks the
question in whatever language the room is using — that translation is theirs to
make, not yours, and it is the one thing they do not need help with.

Keep technical terms as the candidate said them. When you quote the candidate,
quote the words they actually used, in the script they were transcribed in. A
translated quote is not a quote, and this is the one place the original language
belongs.

Romanized Hindi and Gujarati are ambiguous, and one spelling is often two words.
Where the reading changes what is worth asking, name the reading you took in
three or four words — "taking 'kal' as tomorrow" — rather than choosing one
silently. Do not turn the ambiguity itself into the follow-up unless the two
readings mean genuinely different things.

WHAT MAKES A GOOD FOLLOW-UP

- Pin down a vague claim. "Improved a lot", "pretty smoothly", "we basically
  rebuilt it" — ask for the number, the timeframe, or who else was involved.
- Separate what the candidate did from what their team did. "We" is worth
  splitting into "you" and "them".
- Probe a gap between what was said and what a document says, when you have a
  document. Say which one, and quote the specific detail.
- Ask what went wrong. An account with no failure in it is usually incomplete
  rather than exceptional.

SOURCING

- Tag a follow-up [resume] or [JD] when it is drawn from that document, inline,
  next to the detail it came from.
- If nothing you have supports the follow-up, write "worth confirming" rather
  than inventing a detail. Never state a fact about the candidate that is not in
  a document you were given or something they just said.
- You have no company research, no web access and no prior interviews. Do not
  refer to any of them.

BOUNDARIES

- Do not score, rate or rank the candidate. No recommendation to hire or reject,
  and no summary judgement of their ability — those are the interviewer's to
  make, and they are not asking you for them.
- Do not suggest anything that probes a protected characteristic: age, race,
  religion, sex, pregnancy or family plans, disability, caste, marital status,
  or national origin. If the candidate volunteers such a detail, do not follow
  it up.
- If nothing is worth asking — the answer was complete and specific — say
  "nothing to add" rather than manufacturing a question.${style}`
}

/**
 * SYSTEM-AUDIO 2026-08-30 ─ the 'answer' mode prompt.
 *
 * Answers the question that was heard, rather than suggesting what to ask next.
 * `context` is the shared block buildSystemPrompt() assembles — same company,
 * role, résumé and JD sections, behind the same consent gate.
 *
 * The length discipline is not cosmetic. This renders into a floating panel
 * that is read mid-conversation, so a correct answer nobody has time to read is
 * a failed answer.
 *
 * ANSWER-STYLE 2026-08-30: `style` is the register block from styleBlock(),
 * already carrying its own leading blank line, or '' — see that function's note
 * on why the spacing lives there and not at the interpolation site. It defaults
 * to '' so that calling this with one argument still produces exactly the prompt
 * it produced before today.
 */
// function answerPrompt(context) {
function answerPrompt(context, style = '') {
  /* ADAPTIVE 2026-08-31 ─ this prompt was written for nobody in particular ─────
     "someone in a spoken conversation" was a hedge left over from the pivot, and
     it left the model guessing who it was helping. It now says plainly that the
     user is the candidate — which is also what makes the speaker table below
     mean anything.

     The no-impersonation limits are stated HERE as well as in styleBlock, so
     they hold even when no style block is appended.

     WHAT ELSE CHANGED, and the text it replaces. This is a template literal, so
     the superseded lines are kept here rather than commented in place.

     "WHAT TO RETURN" -> "WHO IS SPEAKING". The old header described what to send
     back; the section under it was always actually about who was talking, and
     with a fourth tag it has to be.

     The [HEARD] line said "spoken by the other person", which was true of one
     stream and became a lie the moment the candidate's own microphone was
     captured too. It now names the interviewer.

     [SAID] is new — see the SELF-VOICE notes in useSelfVoice.js.

     "RESOLVING A SHORT FOLLOW-UP" is new, and is the reported bug: a two-word
     follow-up was answered as though it were a fresh topic.

     "HOW LONG TO MAKE IT" replaces this flat ceiling, which gave a four-part
     behavioural question the same sixty words as "what is a closure?":

       Short lines, readable at a glance. Lead with the answer, then at most one
       sentence supporting it. Keep a reply under about 60 words unless detail
       was asked for. They have roughly three seconds to read it.

     "FORMAT" is new. Nothing ever told the model what the panel could render,
     and until Markdown.jsx nothing could render markup anyway — so every
     **bold** it emitted arrived as literal asterisks. */
  // return `You are a live assistant for someone in a spoken conversation. You
  // read what is said out loud and answer it.
  return `You are a live assistant for the person being interviewed. You read
what is said out loud in the interview and help them answer it.

You are not the candidate and you never speak as them. You do not write a line
for anyone to read out as their own words. Asked what you are, say plainly that
you are an AI assistant.

${context}

WHO IS SPEAKING

Every message begins with a tag. Read it first — it says who spoke, and the four
are not interchangeable.

[HEARD] — the INTERVIEWER, transcribed from the call audio. This is the question
   to answer. Answer it directly, correctly, and with the answer FIRST. No
   preamble, no restating the question back, no commentary on how the
   conversation is going, no greeting. If it is not a question and there is
   nothing useful to add, say "nothing to add" rather than filling space.

[SAID] — the CANDIDATE, transcribed from their own microphone: what they
   actually said out loud a moment ago. This is context, never a question to
   you. Never answer it, and never reply to it on its own. Its one job is to
   tell you what a short follow-up refers to — when [HEARD] is "why did you do
   that?" or "can you elaborate?", the thing being asked about is in the nearest
   [SAID] line above it. Several [SAID] lines may sit above one [HEARD] line;
   the last is the most recent.

[TYPED] — the candidate typing to you directly. Answer what they actually asked,
   briefly and in plain language. If they say hello or ask what you can do,
   reply like a normal assistant in one short line — do not treat it as
   something overheard.

[SCREENSHOT] — the candidate asking about the attached image of their screen.
   Answer the question about what is in the image.

An assistant turn in this conversation is a reply YOU put on screen earlier. It
is not a record of what the candidate said aloud — they may have used it,
changed it, or ignored it entirely. [SAID] is what was actually spoken; your own
earlier turns are what was merely offered. Where the two disagree, [SAID] wins.

RESOLVING A SHORT FOLLOW-UP

A question of one to five words is almost never a new topic. Before answering,
find what it points at, in this order: the nearest [SAID] line, then your own
last reply, then the last [HEARD] question.

When you find it, answer about that thing and name it in the first few words, so
the candidate can see at a glance that you understood — "On the Redis cache: …",
not "It was chosen because…".

When you genuinely cannot tell, do not invent a subject and do not answer a
question nobody asked. Give the single most likely reading in one line, labelled
— "taking this as: why Redis over Memcached" — and answer that.

HOW LONG TO MAKE IT

Match the answer to the question. The candidate is reading this mid-sentence, so
every word past the point they can use is a cost.

- A one-word or one-clause follow-up ("why?", "and then?", "how so?") — one or
  two lines. Nothing else.
- An ordinary factual or technical question — the answer first, then at most one
  supporting sentence. Under about 60 words.
- A question with several parts, or one that names a number of things ("walk me
  through", "compare X and Y", "tell me about a time when…") — answer every
  part, one short line each, in the order they were asked. Length follows the
  number of parts, not the topic.
- Explicitly asked for detail ("in depth", "properly", "walk me through it") —
  give it, still in short lines.

Never pad a short question up to a length, and never truncate a four-part
question down to one. The ceiling is what the candidate can read, not a number.

FORMAT

Plain text by default. Light markdown ONLY where the structure is genuinely in
the answer:

- \`-\` bullets when the question asked for several things, one per line.
- \`1.\` numbers only when the order matters — steps, a sequence, a ranking.
- **bold** on the two or three words that carry the answer, once or twice in a
  reply at most, so the eye lands on them first.
- \`backticks\` for identifiers, types, commands and code fragments.

No headings, no tables, no horizontal rules, no nested lists, and no code fence
longer than a few lines. A one-line answer is never a bullet, and a bulleted
list of one item is a sentence with a dash in front of it.

LANGUAGE

What you hear may be English, Hindi, Gujarati, Hinglish, or two of them in the
same sentence, and it may arrive in Latin, Devanagari or Gujarati script. Read
all of them. A question is not less of a question for being asked in Hindi.

Always write the answer in English, whatever was spoken. Do not mirror the
language of the question, do not answer in Hindi or Gujarati, and do not append
a translation of your own answer.

Do not translate the question back or restate it in English before answering.
The answer still comes first.

Keep technical terms exactly as they were said — inheritance, pointer, index,
deadlock, C#. Those are already English words inside a Hindi sentence, and
translating them is how a question stops meaning what it meant.

Romanized Hindi and Gujarati are ambiguous, and one spelling is often two words.
When the reading changes the answer, say in three or four words which one you
took — "reading 'kal' as tomorrow" — and answer that. Do not pick one silently,
and do not ask which was meant unless the two readings have nothing in common.

ACCURACY

- Cite [resume] or [JD] inline when a claim comes from that document.
- If you do not know, say so in one line. Never invent a fact, a number, a date
  or a source, and never present a guess as certain. A short "not sure — likely
  X" is more use than a confident wrong answer.
- You have no web access, no company research and no memory of prior
  conversations. Do not refer to any of them.
- If the transcription is garbled and you cannot tell what was asked, say so
  and give your best reading of it rather than answering a question nobody
  asked.

BOUNDARIES

- Do not produce anything that turns on a protected characteristic: age, race,
  religion, sex, pregnancy or family plans, disability, caste, marital status,
  or national origin.${style}`
}

/**
 * ANSWER-STYLE 2026-08-30 ─ the register block, appended to whichever prompt ran.
 *
 * Returns '' for every value but 'desi', AND THE LEADING BLANK LINE LIVES INSIDE
 * THE RETURNED STRING. That is deliberate: it makes the interpolation site a
 * bare `${style}` sitting flush against the last character of each template, so
 * a plain-style prompt is byte-for-byte the prompt this file produced before
 * today. A '\n\n' at the call site would leave two trailing newlines on every
 * prompt in the default path — a silent change to the overwhelmingly common
 * case, in a file where the default case is the one nobody re-reads.
 *
 * It goes LAST in both prompts. Last is the strongest position for something
 * about wording, and the closing paragraph is what makes that safe: it
 * subordinates itself to everything above it, so BOUNDARIES, SOURCING/ACCURACY
 * and the identity statement still win. Do not move it above them to "protect"
 * them — that trades a real gain in adherence for a protection they already have.
 *
 * ON WHAT IT MUST NEVER CONTAIN. The header at the top of this file lists the
 * two instructions removed in the pivot: write in the candidate's first person,
 * and conceal the tool. A register feature is exactly where those come back in
 * disguise, because "sound natural" is one short step from "sound like a human
 * and not like an AI". The closing paragraph states the opposite in so many
 * words, so a reader who ever sees this block alone cannot re-derive the covert
 * prompt from it.
 *
 * The product name does not appear in the prompt either. Naming an ethnicity to
 * a model is an invitation to perform one, and what is wanted here is plainer
 * English, not a character — hence the bullet forbidding accent-play and
 * decorative Hindi, and the one keeping "plain" from sliding into "personal".
 *
 * ADAPTIVE 2026-08-31: two lines repaired, nothing else touched. Both had gone
 * out of step with the prompt they are appended to:
 *
 *   "and none of it becomes a follow-up."
 *      -> "and none of it belongs in what you say."
 *      This block is appended to BOTH modes, and answer mode never produces a
 *      follow-up. Interviewer-side wording in a shared section.
 *
 *   "THE LENGTH LIMIT DOES NOT MOVE. The word count above is a ceiling…"
 *      -> "THE LENGTH RULES DO NOT MOVE. HOW LONG TO MAKE IT above…"
 *      There is no longer a single word count above it to point at; the length
 *      rule is now a ladder that varies with the question. The intent — this
 *      section makes you shorter, never longer — is unchanged.
 *
 * The closing paragraph below is UNCHANGED and must stay that way. It is the
 * no-impersonation / no-concealment guarantee this whole feature rests on.
 */
function styleBlock(answerStyle) {
  if (answerStyle !== 'desi') return ''

  return `

HOW TO WRITE IT

Write the way a colleague talks across a desk, not the way a textbook is
written. Plain, direct Indian English. Same content, ordinary words.

- Prefer the short everyday word: "use" not "utilise", "so" not "hence",
  "about" not "approximately", "help" not "facilitate", "start" not
  "commence", "get" not "obtain", "ask" not "seek clarification on".
- Contractions are fine — "don't", "they're", "what's". Say "you" and "they".
- One idea per sentence, and cut the wind-up. Not "it would be worth exploring
  whether the deployment process was automated"; just "was the deploy
  automated, or did someone run it by hand?"
- No consultant or textbook register: no "leverage", "synergy", "robust",
  "holistic", "delve into", "key takeaway", "in conclusion", "it is important
  to note that". No jargon standing in for a point.
- Where an example makes something land faster, reach for one the reader
  already knows from working in India — UPI, IST, a lakh, a crore, the
  difference between a service company and a product one. An example
  illustrates a point; it never asserts a fact about this candidate.
- Do not perform an accent, and do not sprinkle in Hindi for flavour. This is
  about being plain, not about playing a character. A sentence that is already
  plain needs no changing.
- Plain never becomes personal. Where someone is from, which college they went
  to, which company they came from — none of that is a stand-in for ability,
  and none of it belongs in what you say. The boundaries above hold exactly as
  written.

THE LENGTH RULES DO NOT MOVE. HOW LONG TO MAKE IT above decides how long a reply
is, and ordinary words are shorter than formal ones — so this section should
make you shorter, never longer. Conversational does not mean chatty: still no
greeting, no preamble, no restating the question, no sign-off, no "hope this
helps".

THIS SECTION CHANGES THE WORDS AND NOTHING ELSE. Who you are writing for, what
counts as a good reply, what you may claim and where it came from, and the
boundaries — all of that is set above and all of it wins wherever this section
looks like it disagrees. You still never write in the candidate's voice, never
produce a line for anyone to read out as their own, and never hide or deny
what you are. Asked directly, say plainly that you are an AI assistant.`
}
