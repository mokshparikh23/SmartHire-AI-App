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

  SELF-INTRO 2026-09-06 ─ READ THIS BEFORE TRUSTING THE PARAGRAPH ABOVE.

  The owner re-enabled FIRST-PERSON ANSWERS for introduction and behavioural
  questions on 2026-09-06. So "do not re-add them" is now true of one of the two
  and not of the other, and the two must be held apart deliberately:

    · FIRST PERSON is back, scoped to INTRODUCTION AND BEHAVIOURAL QUESTIONS,
      and only ever over facts that are in the user's own résumé. The full
      reasoning is in the SELF-INTRO note inside answerPrompt().
    · "NEVER reveal you are an assistant" IS STILL OUT, permanently, and was
      never part of what was asked for. answerPrompt() and styleBlock() both
      still close by telling the model to say plainly that it is an AI.

  THIS BLOCK IS STILL NOT A SOURCE TO COPY FROM. It is tempting now — it is
  right there and it answers by question type — but it carries the concealment
  instruction in the same breath as the first-person one, and it also says
  "NEVER make up experience not in the resume" while giving the model no way to
  answer around a gap. The live prompt does that properly, under NEVER MAKE THE
  DOCUMENT THE SUBJECT. Half of a covert prompt being wanted again does not make
  the other half wanted.

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
 * SELF-INTRO 2026-09-06: this said "Neither mode writes in a candidate's voice
 * or conceals what it is." The first half stopped being true on 2026-09-06 —
 * 'answer' mode writes an introduction or a behavioural answer in the
 * candidate's own voice now, over facts from their own résumé. The second half
 * is unchanged and is not up for revision: neither mode conceals what it is.
 *
 * That distinction is the whole of the change. The covert prompt at the top of
 * this file bundled the two together, which is why the note there has to be
 * read with its 2026-09-06 addendum rather than on its own.
 *
 * CONSENT GATE: the resume is included only when `resumeConsent` is true. That
 * check lives here, in the prompt builder, rather than in the setup screen —
 * the UI can be skipped, re-rendered or worked around, but nothing reaches the
 * model without passing through this function. If the flag is false the resume
 * text is simply absent from the prompt, so there is no path by which it
 * influences a suggestion. It gates BOTH modes: the branch below chooses
 * wording, never whether the document is present.
 *
 * OWN-CV 2026-09-01 ─ THE TICK IS GONE, AND WITH IT THE FLAG ──────────────────
 * The gate above was the last piece of the interviewer-side product still
 * standing in this file. It asked the reader to confirm that someone had agreed
 * to a document being used — but the reader IS that someone, the document is
 * their own CV, and they uploaded it to this app for exactly one purpose. A
 * second yes on top of the upload was not a protection, it was a way to lose an
 * interview to a box nobody noticed: the resume sat in the row, every answer
 * came out generic, and nothing on screen said why.
 *
 * The rule now is the upload itself. A resume present is a resume used; no
 * resume means the else-branch below, which is the same branch an unticked box
 * used to reach. Nothing new can flow to the model that a ticked box did not
 * already send — what changes is that the user is no longer asked twice.
 *
 * Removing a document is still how you stop it being used, and that path
 * deletes the file rather than leaving it on the account under a false flag —
 * strictly more removal than unticking ever did.
 */
export function buildSystemPrompt() {
  // const { interviewContext } = useSettingsStore.getState()
  // const { interviewContext, answerMode } = useSettingsStore.getState()
  const { interviewContext, answerMode, answerStyle } = useSettingsStore.getState()
  // CONTEXT 2026-08-31: candidateName, companyDomain and resumeBrief added. All
  // three were already fetched or already in the schema and simply never reached
  // the prompt — see the notes at each use below.
  // const { company, role, resume, jobDescription, resumeConsent } = interviewContext
  // OWN-CV 2026-09-01: resumeConsent is no longer destructured. It is still on
  // the context object and still returned by /api/profiles — dropping it there
  // would break a desktop build older than this one, which does still gate on
  // it — but nothing in this function may read it again, and the surest way to
  // guarantee that is for the name not to exist here.
  // const {
  //   company, role, resume, jobDescription, resumeConsent,
  //   candidateName, companyDomain, resumeBrief,
  // } = interviewContext
  const {
    company, role, resume, jobDescription,
    candidateName, companyDomain, resumeBrief,
  } = interviewContext
  // SELF-VOICE 2026-08-31: which audio is being captured decides whether the
  // model can trust who spoke a [HEARD] line.
  const { captureSource } = useSessionStore.getState()

  // Falsy-safe: a resume that was pasted before consent was given must not leak
  // through on a stale flag, and an empty string must not produce a headed but
  // blank section that reads to the model as "no relevant experience".
  // const useResume = resumeConsent === true && typeof resume === 'string' && resume.trim() !== ''
  /* OWN-CV 2026-09-01: one condition, and it is the only one there was ever
     anything to check. The `typeof` and the `.trim()` stay exactly as they
     were — the second half of the note above still holds, and it is the half
     that was doing real work. An empty string is not a resume, and a headed but
     blank RÉSUMÉ section reads to the model as a positive claim of no
     experience, which is worse than no section at all. */
  const useResume = typeof resume === 'string' && resume.trim() !== ''
  const useJD = typeof jobDescription === 'string' && jobDescription.trim() !== ''

  /* CONTEXT 2026-08-31 ─ THE most important line in this change ────────────────
     The brief is a second projection of the same document, so it rides the SAME
     gate, in the SAME expression. Writing it as its own boolean is precisely how
     a consent gate gets quietly bypassed by the next field somebody adds.

     OWN-CV 2026-09-01: still true, and still written this way. `useResume` is a
     simpler test now, but "every projection of the document rides the same
     boolean" is the property worth keeping — it is what makes "no resume" mean
     no resume anywhere in the prompt, brief included. */
  const brief = useResume && typeof resumeBrief === 'string' ? resumeBrief.trim() : ''

  const sections = [
    /* CONTEXT 2026-08-31: the candidate's name was written on the dashboard,
       returned by /api/profiles and rendered in the launcher list, and then
       simply never copied into interviewContext — so the model never had it.

       It is deliberately NOT behind resumeConsent. In a candidate-side product
       this is the user's own name, in their own app, typed by them on their own
       dashboard. The resume carries the name only under consent because the
       resume is a document about them; their name is how they are addressed.
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
    /* CANDIDATE-ONLY 2026-09-01: "CANDIDATE RÉSUMÉ — the candidate has agreed to
       its use" is third-person about the reader. With the interviewer mode
       retired there is one reader and this document is their own; the consent
       language was describing a permission somebody else granted. The GATE is
       untouched — `useResume` above still decides whether this block exists at
       all — only the framing changes. */
    // sections.push(`CANDIDATE RÉSUMÉ — the candidate has agreed to its use in this interview.
    // Cite it as [resume] when something you say comes from it.`)
    /* OWN-CV 2026-09-01: "switched on for this conversation" described the tick,
       and there is no tick. It also implied a second state the model might
       reason about; there is only one — the document is here, so use it. */
    // sections.push(`YOUR RÉSUMÉ — the user's own, switched on for this conversation.
    // Cite it as [resume] when something you say comes from it.`)
    sections.push(`YOUR RÉSUMÉ — the user's own, uploaded by them for this interview.
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
    /* CANDIDATE-ONLY 2026-09-01: "the candidate's resume" and "their background"
       are third-person about the reader, and this is the branch EVERY
       resume-less session hits — which, now that a session can start with no
       interview set up at all, is most first sessions. */
    // sections.push(`You have NOT been given the candidate's resume. Either none was supplied,
    // or consent for its use has not been confirmed. Do not speculate about their
    // background, …  Work only from what is actually said in this conversation.`)
    /* OWN-CV 2026-09-01: "or it is switched off" was the unticked-box case. With
       the tick gone there is exactly one way to reach this branch — no resume
       was uploaded — so saying so plainly is both shorter and true. The
       instruction after it is unchanged and is the part that matters: this is
       the branch most sessions hit, because a session can start with no
       interview set up at all. */
    // sections.push(`No resume is available for this conversation — either none was uploaded,
    // or it is switched off. Do not speculate about the user's background, …`)
    sections.push(`No resume is available for this conversation — none was uploaded.
Do not speculate about the user's background, do not ask for a resume, and do
not infer what might be in one. Work only from what is actually said in this
conversation.`)
  }

  if (useJD) {
    // ADAPTIVE 2026-08-31: same neutral wording as the resume line above.
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
    above and are not passed to it. The resume gate decides what the model is
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
  /* CANDIDATE-ONLY 2026-09-01 ─ the branch is gone; there is one reader.
     This app is for the person BEING interviewed. Keeping a second prompt behind
     a dropdown is what forced every shared string above — the resume block, the
     no-resume block, the JD line, the [SCREENSHOT] rule — to be written for two
     different readers at once, and each of those has already had to be corrected
     once for exactly that reason (see the ADAPTIVE 2026-08-31 notes above).

     The interviewer prompt below is kept, unreachable, per the repo's
     keep-don't-delete rule. `answerMode` is pinned to 'answer' in three places in
     store/settingsStore.js; this unconditional return is the one that decides
     behaviour, and it holds even if a hand-edited blob says otherwise. */
  // if (answerMode === 'answer') return answerPrompt(context, style)
  return answerPrompt(context, style)

  // eslint-disable-next-line no-unreachable
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

FORMAT

Plain text by default. Light markdown ONLY where the structure is genuinely in
what you are saying:

- \`-\` bullets when you are giving more than one follow-up, one per line.
- **bold** the specific detail a follow-up is pinning down — the claim, the
  number, the word that was vague. Not whole sentences.
- ==highlight== the single question worth asking first, when one clearly leads.
  At most one per reply, and often none.
- \`backticks\` for identifiers, types, commands and code fragments.

No headings, no tables, no horizontal rules, no nested lists.

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
 * role, resume and JD sections, behind the same consent gate.
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
     **bold** it emitted arrived as literal asterisks.

     EMPHASIS 2026-09-01 ─ two changes to that section, and one omission fixed.

     The bold rule said "on the two or three words that carry the answer, once or
     twice in a reply at most". The cap was doing the damage: a model told it may
     emphasise twice at most emphasises approximately never, so the feature read
     as broken rather than as restrained. What actually needs bounding is the
     SPAN — half a bold line emphasises nothing — not the count.

     ==highlight== is new, and is capped at one BECAUSE bold no longer is. There
     have to be two levels: bold for the terms that carry the answer, and one
     painted span for the thing that has to be said out loud. If the loud level
     were uncapped it would become the ordinary one and the ladder would collapse
     back to a single step.

     The omission: the followups prompt below had no FORMAT section at all, while
     the panel renders markdown for both modes. It has one now.

     SCREEN-ANSWERS 2026-09-06 ─ the screenshot answered nothing at all ──────────

     Reported: press Screenshot, and the card comes back describing the window
     instead of answering the coding problem, the aptitude sum or the "tell me
     about yourself" that is on it. Three separate causes, and this file owns two.

     (The third is not here: askAboutScreen was sending the words "What is being
     asked on screen?" up the wire as the instruction. See the note of the same
     name in useInterviewSession.js.)

     THE FIRST IS A HOLE. There has never been a live instruction for a
     multiple-choice question, for an introduction, or for a behavioural question.
     The only place those were ever written down is the covert prompt kept
     commented at the top of this file, and that one is not a source to copy from:
     it instructs impersonation outright. So the model met the commonest screens in
     an interview with nothing but the general rules, and did the one thing those
     rules always support, which is to say what it sees.

     THE SECOND IS SILENCE ABOUT FAILURE. Nothing told the model what to do when
     the capture is too compressed to read. Describing the layout is the natural
     fallback from "I cannot read this", and it is the worst one: the candidate
     cannot tell a description-because-unreadable from a description-because-lazy,
     so they retry the same shot and get the same nothing.

     REPLACED TEXT, kept here per the note above. [SCREENSHOT] was:

       [SCREENSHOT] — an image of the candidate's screen. Work out what is being
          ASKED on it and answer that. Do not describe the screen; the candidate
          can already see it. Read it and decide which it is:
            · a coding problem, an algorithm question, a failing test or a stack
              trace — answer it under CODING AND PROBLEM QUESTIONS below;
            · an aptitude, quantitative or logical-reasoning question — same
              section;
            · anything else — answer the question that is on the screen, or the
              one in the accompanying text if there is one.
          The accompanying text may be the last thing that was heard, which may
          have nothing to do with the image. When the two disagree, the image is
          what the candidate is looking at, so the image wins. If the screen holds
          no question at all, say what is on it in one line and stop.

     "say what is on it in one line and stop" was reachable far too easily. A slide
     with the question implied, an editor with a half-written function, an MCQ with
     no question mark anywhere on it — none of those "holds a question" if you are
     looking for a reason not to answer, and describing is always the cheaper
     reply. It survives as a genuine last resort, behind a cannot-read branch that
     has to name the fix (zoom in, scroll, capture again) rather than describe.

     "or the one in the accompanying text" goes. After the change in
     useInterviewSession.js the accompanying text is an INSTRUCTION, not a
     question, so that clause pointed at nothing — and it was the exact hole the
     stale-question bug fell through.

     "the four are not interchangeable" -> "the five", and "it says who spoke" ->
     "it says where the message came from". [EARLIER SCREENSHOT] is the fifth and
     it names no speaker — see the SCREEN-ANSWERS note in useInterviewSession.js
     for why a replayed screenshot must not keep the tag it was sent under.

     MULTIPLE-CHOICE QUESTIONS and INTRODUCTION AND BEHAVIOURAL QUESTIONS are new
     sections. Note what the second one is NOT allowed to be: the covert prompt
     answered exactly these by writing the candidate's words in first person, and
     that is the instruction this product was pivoted away from. It gives the
     POINTS to make. A candidate reading a script aloud sounds like a candidate
     reading a script aloud; a candidate working from four bullets sounds like
     themselves.

     HOW LONG TO MAKE IT gains a paragraph rather than a fourth exception. An
     introduction is already the multi-part case in that ladder — "tell me about a
     time when…" is listed there in so many words — so saying so is cheaper and
     truer than opening a second hole in a ceiling that exists for a reason. "One
     exception, and it is the only one" therefore stays literally correct.

     WHAT IT COST, measured rather than guessed: the template grew 8960 -> 14439
     characters, about +1370 tokens, on EVERY request including the spoken ones
     this section is not for. That is paid back by OpenAI's automatic prompt
     caching — the system prompt is the first message and is stable for the life
     of a session, so after the first request of an interview it is a cache hit —
     but the FIRST question of every session now carries it in full.

     If time-to-first-token measurably regresses, the two new sections at the
     bottom are what to move, behind the `intent` the server already computes in
     modelForIntent(). They are the only part of this change that is dead weight
     on an ordinary spoken question; everything above is routing the model has to
     read to know which branch it is in. That is a bigger change than this one and
     it should be driven by a measurement, not by this comment.

     SELF-INTRO 2026-09-06 ─ the intro is WRITTEN now, not sketched ─────────────

     Reported: résumé uploaded, "tell me about yourself" asked, and the panel
     comes back with a shape — "what they do now", "the two skills this role
     asks for" — instead of an answer. The résumé was never the problem; it is
     interpolated in full by buildSystemPrompt() and always was. What produced
     the shape was this prompt, which forbade the answer outright.

     THE OWNER LIFTED THE FIRST-PERSON LIMIT on 2026-09-06, deliberately, having
     been shown the three places it was written into and the four claims the
     marketing site makes about it. Introduction and behavioural questions are
     answered in the candidate's voice now, first person, ready to say out loud.
     The facts are their own: this is their CV, in their app, uploaded by them
     for exactly this.

     WHAT DID NOT MOVE, and must not be quietly collected along with it:

       · NOTHING IS INVENTED. Every employer, title, project, number and span of
         time still comes from [resume] or [JD]. That rule did not survive this
         change by accident — it is now the ONLY thing standing between a
         first-person answer and a fabricated one, so it is stated harder below
         than it was before, not softer.
       · The no-résumé branch is untouched. No résumé still means the shape only
         and no invented background, and that was asked for in so many words.
       · The concealment limit is untouched. Asked what it is, it still says
         plainly that it is an AI assistant.
       · The covert prompt at the head of this file is STILL NOT A SOURCE TO COPY
         FROM. It carries "NEVER reveal you are an assistant" in the same breath
         as the first-person instruction, and that half stays out. Half of it
         being wanted again does not make the other half wanted.

     REPLACED TEXT, kept here rather than in place because this is a template
     literal and an inline comment would be emitted as prompt text. The identity
     paragraph was:

       You are not the candidate and you never speak as them. You do not write a
       line for anyone to read out as their own words. Asked what you are, say
       plainly that you are an AI assistant.

     Its last sentence is the concealment limit and is kept below, promoted to
     its own paragraph so that removing the two sentences in front of it could
     not take it along by accident.

     INTRODUCTION AND BEHAVIOURAL QUESTIONS opened with this, which is the line
     that actually produced the reported bug:

       YOU DO NOT WRITE THE ANSWER. You give the candidate the POINTS to make
       and the order to make them in; the words are theirs. Never write a
       first-person script, never write a line beginning "I " for someone to
       read out, and never put a sentence in quotation marks for them to say.
       This is not a style preference: a read-out script sounds like a read-out
       script in the room, and it is the one thing this assistant does not do.

     and carried these two bullets, now replaced:

       - Four to six lines, one point each, strongest first, a handful of words
         a line. This is the multi-part case in HOW LONG TO MAKE IT, not an
         exception to it.
       - For an introduction, the shape is four lines: what they do now; the two
         skills this role actually asks for; one proof of those from [resume];
         why this role.

     The argument in the first block is not wrong — a script read aloud does
     sound like a script read aloud — and it is worth keeping in view rather
     than pretending it was never made. It is answered rather than dismissed:
     the section now demands spoken sentences, contractions and one idea per
     sentence precisely so that what comes out is sayable rather than recited.
     Whether that lands is a judgement about the room, and the owner made it.

     HOW LONG TO MAKE IT closed with a ceiling that had exactly one exception:

       One exception, and it is the only one: a coding problem or a quantitative
       question. …

       An introduction or a behavioural question is NOT a second exception — it
       is the multi-part case above. Four to six short lines, one point each,
       and the ceiling is still what the candidate can read at a glance, not a
       word count.

     There are two exceptions now. An introduction that has to be SAID is about
     a minute of speech; the three-second reading rule that governs everything
     else is the wrong instrument for the one turn where the candidate is
     expected to hold the floor.

     ACCURACY's "if you do not know, say so in one line" gained a sentence
     fencing it to facts of the world, because it was the bullet the model was
     reaching for when it answered "that is not in your résumé" — see NEVER MAKE
     THE DOCUMENT THE SUBJECT, which is new and is the other half of this
     change. That section is what makes the no-invention rule survivable: a
     model forbidden both to invent AND to answer around a gap has only the
     dropped turn left, which is what it was doing. */
  // return `You are a live assistant for someone in a spoken conversation. You
  // read what is said out loud and answer it.
  return `You are a live assistant for the person being interviewed. You read
what is said out loud in the interview and help them answer it.

When the question is about THEM — their background, a project they worked on, a
time something happened to them — write the answer in their voice, first person,
ready to say out loud. Every fact in it comes from their own résumé, the job
description, or this conversation. You never add one that does not.

Asked what you are, say plainly that you are an AI assistant. Never deny it.

${context}

WHO IS SPEAKING

Every message begins with a tag. Read it first — it says where the message came
from, and the five are not interchangeable.

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

[SCREENSHOT] — an image of the candidate's screen, attached to THIS message. The
   question is IN THE IMAGE. Work out what is being ASKED and ANSWER THAT. You
   are not describing a picture: "the screen shows a problem about merging two
   sorted arrays" is a failure, not an answer — the candidate is looking at that
   screen and already knows what is on it. Read it and decide which it is:
     · a coding problem, an algorithm question, a failing test or a stack trace
       — answer it under CODING AND PROBLEM QUESTIONS below;
     · an aptitude, quantitative or logical-reasoning question — same section;
     · a multiple-choice question, with lettered or numbered options — answer it
       under MULTIPLE-CHOICE QUESTIONS below;
     · "tell me about yourself", "walk me through your resume", "tell me about a
       time when…", "why this company?", "what is your weakness?" — answer it
       under INTRODUCTION AND BEHAVIOURAL QUESTIONS below;
     · anything else — answer the question that is on the screen. A screen with
       no question mark on it is usually still a TASK: code to complete, an error
       to fix, a form to fill, a problem statement with the question left
       implied. Answer the task.
   Text arrives with the image. It is either an instruction from the app or the
   last thing that was heard, which may have nothing to do with the image. When
   the two disagree, the image is what the candidate is looking at, so the image
   wins. It may instead be an instruction about a reply you already gave — "same
   question, shorter", "add the detail you left out" — in which case follow it,
   about this same screen.
   WHEN YOU CANNOT READ IT. This is a compressed screenshot and small text can
   arrive too soft to be sure of. If you cannot actually read the words, say so
   in one line and say what would fix it — zoom in, scroll to the question,
   capture again — and say what you could make out: "the code is not legible; it
   looks like a two-pointer problem on a sorted array". Do not guess a problem
   statement and then solve the guess: an answer to a question that is not on the
   screen is worse than an admission, because the candidate cannot tell the two
   apart until it is too late. And do not fall back to describing the window
   instead; that is the same failure wearing a hat. One unreadable token inside
   an otherwise clear question is different — name the reading you took, in three
   or four words, and answer. Only if the screen truly holds no question and no
   task at all, say what is on it in one line and stop.

[EARLIER SCREENSHOT] — a screenshot turn from EARLIER in this conversation. THE
   IMAGE IS NO LONGER ATTACHED; only the words survive. It is here so that a
   follow-up has its antecedent, and for nothing else. Do not answer it again.
   Do not treat it as a description of the screen the candidate is on now — that
   screen has moved on. Do not read the reply that follows it as an example of
   how a [SCREENSHOT] should be answered; you cannot see what it was answering.
   If the candidate asks about "that question" and one of these is the only
   record of it, say the image is gone and ask for a fresh screenshot.

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

Two exceptions, and there are only two.

The first is a coding problem or a quantitative question. Those are answered
under CODING AND PROBLEM QUESTIONS below, and the code block and the dry run
there are outside this ceiling entirely. Truncating a function to fit a word
count produces something that does not run, which is worse than nothing.

The second is an introduction or a behavioural question, answered under
INTRODUCTION AND BEHAVIOURAL QUESTIONS below. Those are written out as spoken
sentences, and a spoken introduction is about a minute of talking — roughly 90
to 120 words. It is the one moment in the interview where the candidate is
expected to hold the floor, so the three-second rule is not the one that
applies. Cut to sixty words an introduction stops mid-thought, which costs more
in the room than being slightly long.

FORMAT

Plain text by default. Light markdown ONLY where the structure is genuinely in
the answer:

- \`-\` bullets when the question asked for several things, one per line.
- \`1.\` numbers only when the order matters — steps, a sequence, a ranking.
- **bold** every term that carries the answer — the name, the number, the verb
  the whole reply turns on. Not whole sentences: if half a line is bold, none of
  it is emphasised any more.
- ==highlight== the ONE thing they have to actually say out loud. At most one
  per reply, and often none — an answer with two highlights has none, because
  the eye cannot be sent to two places at once. Use it for the complexity, the
  number, the single word the interviewer is waiting to hear. Never wrap a whole
  sentence in it.
- \`backticks\` for identifiers, types, commands and code fragments. Anything
  inside backticks is left exactly as written, so \`a == b\` is safe to say.

No headings, no tables, no horizontal rules and no nested lists. A one-line
answer is never a bullet, and a bulleted list of one item is a sentence with a
dash in front of it.

Code goes in a fenced block with its language tag — \`\`\`python, \`\`\`java — and never
in loose lines. An unfenced snippet is read as prose: a line starting with "- "
becomes a bullet, "# " becomes a heading, and "---" becomes a rule.

CODING AND PROBLEM QUESTIONS

When the question is a coding problem — heard, typed, or read off a screenshot:

1. One line naming the approach.
2. The code, in a fenced block with its language tag. Write code that RUNS: real
   names, the edge cases handled, no elided bodies and no "// implementation
   here". If the language was not stated, use the one on screen, else Python.
3. \`Time: O(…) · Space: O(…)\` on its own line, with the time complexity
   ==highlighted== — it is the first thing the interviewer asks next.
4. One dry run: a concrete input, the two or three states it passes through, the
   output. Three lines at most.

Nothing else. No restating the problem, no list of alternative approaches, no
closing summary.

When it is an aptitude, quantitative or logical-reasoning question — a ratio, a
percentage, a probability, a series, a work-and-time or profit-and-loss sum:
the answer first, then the working in at most three short numbered lines.

THE LENGTH CEILING ABOVE DOES NOT APPLY TO THE CODE BLOCK OR THE DRY RUN. It
still applies to every line around them: the approach line is one line, and the
complexity line is one line.

MULTIPLE-CHOICE QUESTIONS

A question with lettered or numbered options — on a screen, typed, or read out.

1. The answer first, and give the option ITSELF, not just its label:
   ==**B — O(n log n)**==. A bare "B" is unreadable if the options are shuffled,
   or if the candidate is looking at a different question from the one you read.
2. One line saying why it is right.
3. One more line ONLY when a specific other option is the trap the question was
   built around — name it and say what it gets wrong. Never walk all four.

Select-all-that-apply is the same shape: every correct label and its text on the
first line, then one line of why.

If two options are genuinely defensible, say in one line which reading the
question is asking for, and then pick one. "It depends" is not an answer to a
multiple-choice question. If some options are cut off or unreadable, say which
ones you could read and answer from those.

INTRODUCTION AND BEHAVIOURAL QUESTIONS

"Tell me about yourself", "walk me through your resume", "tell me about a time
when…", "how do you handle…", "why this company?", "what is your biggest
weakness?" — heard, typed, or read off a screen.

WRITE THE ANSWER, in the candidate's own voice, first person, ready to say out
loud. The sentences themselves — not points to expand, not a shape, not
instructions about what to mention. They are mid-interview and have no time to
compose an answer from a skeleton.

That licence is about VOICE and about nothing else. It is not licence to supply
a fact, and the two bullets below are what keep the two apart:

- Every concrete claim — an employer, a title, a project, a number, a span of
  time — comes from [resume] or [JD] and is cited inline where it appears. Tag
  it once at the end of the line it came from, not after every clause.
- If a document does not carry a detail, write the answer without it. Never
  invent an employer, a date, a number or an achievement to round a sentence
  out. An invented achievement is the one mistake in an interview that cannot be
  walked back afterwards, and a fluent first-person paragraph is the easiest
  place in this whole prompt to commit it without noticing.
- For an INTRODUCTION, one paragraph, four beats in this order: what they do now
  and for how long; the two skills this role actually asks for; one concrete
  proof of those from [resume], carrying the number if there is one; why this
  role. Around 90 to 120 words — see HOW LONG TO MAKE IT.
- For "tell me about a time when…", Situation, Task, Action, Result — written as
  four or five spoken sentences, not four labels with fragments after them. The
  result carries the number when [resume] has one; ==highlight== that number,
  because it is the thing the interviewer is waiting to hear.
- Say it the way a person talks: contractions, short sentences, one idea each.
  No consultant register, and no résumé prose read out as though it were speech.
  It has to survive being said out loud, which is a harder test than being read.
- For "why this company?", work from [JD] and from what has been said in this
  conversation. You have no web access and no company research — do not invent a
  product, a value or a piece of news.
- With no resume, do not invent a background. Give the SHAPE only — what belongs
  on each line and in what order — and say in one line that the specifics have
  to come from them.

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
  X" is more use than a confident wrong answer. This bullet is about facts of
  the world. For the candidate's own documents it is the WRONG move — see the
  next section.
- You have no web access, no company research and no memory of prior
  conversations. Do not refer to any of them.
- If the transcription is garbled and you cannot tell what was asked, say so
  and give your best reading of it rather than answering a question nobody
  asked.

NEVER MAKE THE DOCUMENT THE SUBJECT

Do not write "your résumé does not mention that", "that is not in the CV", "the
document does not say", or any other sentence about what you were or were not
given. The candidate knows what is on their own CV. They are mid-interview,
asked a question by a person who is waiting, and a sentence about a document is
a sentence they cannot say out loud — so it is not a short answer, it is a
dropped turn.

This comes up most often as a follow-up about a project: "how did you handle X
on that one?", where the CV names the project but not X. Answer it like this:

- ANSWER THE SUBSTANCE. How that thing is actually done, in the stack the résumé
  does name — the approach, the trade-off, why one way is picked over the other.
  That is a real answer, it is true, and it is what was asked.
- Mark the ONE piece that has to come from them, inline and short, in angle
  quotes: ⟨your bit: which cache you used⟩. At most one per answer. That is the
  honest version of the sentence you are not writing, and unlike that sentence
  it leaves them something to say.
- Do not fill the gap with an invented employer, number, date or achievement.
  Answering AROUND a missing detail is what this section is for; answering
  OVER it is the one thing it is not.

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
 * SELF-INTRO 2026-09-06 ─ ONE OF THOSE TWO IS BACK, AND ONLY ONE. First person
 * was re-enabled by the owner for introduction and behavioural questions — see
 * the note of this name in answerPrompt() above for what was traded and what
 * was not. The paragraph above still describes the danger correctly and is kept
 * for it: the step this block must never take is the SECOND one, from "sound
 * like a person talking" to "sound like a human and not like an AI". The first
 * is now a product decision made upstairs; the second is concealment, it was
 * never asked for, and it is the half that stays out.
 *
 * So the closing paragraph below dropped its voice clause and kept the other
 * two. What it must still carry, in whatever wording: no fact about the
 * candidate that is not in a document, and no hiding what you are.
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
 * SELF-INTRO 2026-09-06: this said "The closing paragraph below is UNCHANGED and
 * must stay that way. It is the no-impersonation / no-concealment guarantee this
 * whole feature rests on." Half of that guarantee was withdrawn upstairs, so the
 * sentence can no longer be true as written. The half that remains is not weaker
 * for it — see the note above. Its previous text, for the record:
 *
 *   You still never write in the candidate's voice, never produce a line for
 *   anyone to read out as their own, and never hide or deny what you are.
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

CODE IS NOT PROSE AND THIS SECTION DOES NOT TOUCH IT. A code block and a dry run
are outside the length rules, so they are outside this section too — do not
shorten them, do not drop lines from a function to sound plainer, and do not
translate identifiers, keywords or comments. Plain English applies to the words
AROUND the code.

THIS SECTION CHANGES THE WORDS AND NOTHING ELSE. Who you are writing for, what
counts as a good reply, what you may claim and where it came from, and the
boundaries — all of that is set above and all of it wins wherever this section
looks like it disagrees. You still never state a fact about the candidate that
is not in a document you were given or something they just said, and never hide
or deny what you are. Asked directly, say plainly that you are an AI assistant.`
}
