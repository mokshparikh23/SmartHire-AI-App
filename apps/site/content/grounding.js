/*
  COPY RULES: see the banner at the top of app/layout.js — no impersonation,
  no concealment, no latency figure.

  SPLIT 2026-09-01: a NEW extraction, not a move. In apps/web/app/page.jsx this
  was an anonymous array literal inlined in the JSX of the Grounding section.
  With that section on its own route it either becomes a named const or the page
  file carries a fourteen-line literal in the middle of its markup.

  ── WHY THIS SECTION EXISTS AT ALL ────────────────────────────────────────────

  CONCEPT 2026-08-30: this was the Consent section — the interviewer's promise
  about a CV that belonged to someone else. The document is the reader's own
  now, so that argument does not transfer, and pretending it does would have
  made it the emptiest section on the site.

  What replaces it is the property that matters when the answer is going to come
  out of your mouth: it answers from your CV, or it admits it does not know.
  Every one of the four is checked against
  apps/desktop/src/services/systemPrompt.js — the ACCURACY block of
  answerPrompt(), the tagging rule, the no-CV branch of buildSystemPrompt(), and
  styleBlock()'s closing paragraph. Do not add a fifth that is not.

  The section id changed with it, #consent -> #grounded, and the footer link
  moved at the same time.
*/
export const GROUNDING = [
  ['file',
   'Every claim carries its source',
   'Anything taken from your CV or the job description is tagged inline, [resume] or [JD], so you can see which half of an answer is a fact about you and which half is general.'],
  ['ban',
   'It will not fill a gap with a guess',
   'Never invent a fact, a number, a date or a source — that is the instruction, in those words. A short “not sure, likely X” is what you get instead, and it is more use to you mid-answer than a confident invention.'],
  /*
    OWN-CV 2026-09-01: the tick this described no longer exists.

    'Your CV is used only once you say so' /
    'Attach it and tick that it can be used. The check sits in the prompt builder rather than the interface, so an unticked CV is not greyed out or ignored later — the section is simply absent from the request.'

    Attaching your own CV to your own interview IS saying so, and the second
    confirmation was costing people the feature they had just set up. The claim
    had to go with it — this is the section of the site whose whole argument is
    that every line here is checked against the prompt builder.

    What replaces it is the other half of the same branch, which is unchanged and
    is the part a reader actually needs: with no CV attached, it does not invent
    one. See the else-branch of buildSystemPrompt() in
    apps/desktop/src/services/systemPrompt.js — "do not speculate about the
    user's background, do not ask for a resume, and do not infer what might be in
    one" — and the delete path in ResumePanel.jsx for the second sentence.
  */
  ['lock',
   'And it will not invent a CV you did not give it',
   'Attach one and every session for that interview draws on it. Attach nothing and it does not guess at your background or fill in a plausible one — it works from what is actually said in the room. Removing a CV deletes the file with it.'],
  ['check',
   'And it never pretends to be you',
   'No first person, no line to read out as your own, and no denying what it is if asked. It hands you the substance; the words that come out of your mouth are yours.'],
]

/** The two paragraphs that sit beside the list. */
export const GROUNDING_LEDE = [
  'A confident wrong answer is worse than no answer at all. You are the one who has to defend it in the next question, and “I think I read that somewhere” is not a recovery.',
  'So the rules below are in the prompt itself rather than in a policy page: name the source, or say plainly that there isn’t one.',
]
