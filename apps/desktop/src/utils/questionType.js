/**
 * INTENT-ROUTING 2026-09-01 ─ what KIND of question was just asked.
 *
 * WHY THIS IS LEXICAL AND NOT A MODEL CALL. The obvious implementation is to ask
 * a cheap model "is this a coding question?" and route on the answer. That costs
 * a whole extra round trip on the live path, and the live path has about three
 * seconds before the answer stops being useful — a classifier that makes the
 * answer late has cost more than it saved. This is the same trade the rest of
 * this directory already makes: utils/completeness/ decides whether a sentence
 * has ended without a model, and utterance.js gates fillers the same way.
 *
 * SO IT WILL BE WRONG SOMETIMES, AND THE ASYMMETRY IS DELIBERATE. A false
 * 'coding' costs a slower, dearer answer to an ordinary question. A false
 * 'general' sends a real coding problem to the fast model and the candidate gets
 * a worse solution in an interview. The second is much worse, so the phrase list
 * leans towards catching the problem.
 *
 * The screenshot path does NOT come through here — it cannot, because the
 * question is inside an image. buildSystemPrompt()'s [SCREENSHOT] section makes
 * the model classify that one itself.
 */

/* Phrases that mean "produce a solution", not "discuss a topic". This is the
   distinction the whole file turns on: "what is a hash map" is a conversation and
   belongs on the fast model; "use a hash map to find the pair" is a problem.

   Hinglish is in here because it is in the room. TRANSCRIBE_PROMPT in
   apps/dashboard/lib/ai.js says so outright — "English, Hindi, Gujarati or a mix, with
   English technical terms" — so an interviewer saying "iska code likho" is an
   ordinary event and a list that only reads English would miss it. */
const CODING = [
  // Being asked to produce code
  /\b(write|show|give)\s+(me\s+)?(the\s+|a\s+|some\s+)?(code|function|program|method|query|solution)\b/,
  /\b(code|implement|solve|program)\s+(it|this|that|the)\b/,
  /\bimplement\s+(a|an|the)\b/,
  /\bhow\s+would\s+you\s+(code|implement|write)\b/,
  /\bcan\s+you\s+(code|implement|write)\s+/,
  /\b(code|program|function|method)\s+(likho|banao|bana\s*do|kar\s*do|likh\s*do)\b/,
  /\b(likho|banao)\b.*\b(code|function|program)\b/,

  // Classic problem framings
  /\bgiven\s+(an?|the)\s+(array|string|list|tree|graph|matrix|number|integer|linked)\b/,
  /\b(reverse|sort|merge|traverse|invert|rotate|flatten|dedupe|de-duplicate)\s+(a|an|the|this)\b/,
  /\bfind\s+the\s+(longest|shortest|largest|smallest|maximum|minimum|missing|duplicate|first|kth|k-th)\b/,
  /\b(two\s+sum|fizz\s*buzz|binary\s+search|linked\s+list|binary\s+tree|dynamic\s+programming)\b/,
  /\bleet\s*code\b/,

  // The follow-up that is always about a solution
  /\b(time|space)\s+complexity\b/,
  /\bbig\s*-?\s*o\b/,
  /\boptimi[sz]e\s+(it|this|that|the)\b/,
  /\bedge\s+cases?\b/,

  // Written on a whiteboard/editor, so almost certainly a problem in progress
  /\bwrite\s+(a\s+)?(sql|query)\b/,
]

/* Quantitative and logical-reasoning rounds. Kept separate from CODING because
   the prompt answers them differently — answer first, then short working — even
   though both escalate to the same model. */
const APTITUDE = [
  /\b(what|how much|how many)\b.*\b(percent(age)?|ratio|average|mean|median|probability)\b/,
  /\bprobability\s+(of|that)\b/,
  /\b(profit|loss)\s+(and|&)\s+(loss|profit)\b/,
  /\b(simple|compound)\s+interest\b/,
  /* Lookaheads, not `A.*B`, because the order is not fixed: "a train travels at
     60 kmph, how long to cover the distance" puts the vehicle first and the
     sequential form missed it. Both halves are required — "train" alone is
     someone's commute and "distance" alone is a vector question. */
  // /\b(speed|distance|time)\b.*\b(train|car|boat|stream)\b/,
  /(?=.*\b(train|car|boat|stream|cyclist|pipes?)\b)(?=.*\b(speed|distance|kmph|km\/h|mph|how\s+long|hours?)\b)/,
  /\bif\s+\d+\s+(men|women|workers|machines|pipes|taps)\b/,
  /\b(next|missing)\s+(number|term)\s+in\s+the\s+(series|sequence)\b/,
  /\bhow\s+many\s+ways\b/,
  /\b\d+\s*%/,
]

/* SELF-INTRO 2026-09-06 ─ the question that needed the best model and got the
   worst ─────────────────────────────────────────────────────────────────────

   "Tell me about yourself" fell to 'general', which honours the user's pick from
   the ⋮ menu, which defaults to the FAST model. So the one question in the
   interview that has to read a whole résumé and synthesise a minute of speech
   out of it was answered by the cheapest tier in the list, while "what is a hash
   map" and a two-word follow-up got exactly the same treatment.

   That was defensible while the prompt only returned four bullet points. It is
   not now that the prompt writes the answer out: the failure mode of a weak
   model on this question is not a slower answer, it is a generic one — the
   résumé skimmed, the specifics dropped, and a paragraph that would fit any
   candidate. Which is indistinguishable, from the reader's side, from the bug
   that started all this.

   THE ASYMMETRY AT THE TOP OF THIS FILE STILL DECIDES THE ORDER. This list is
   checked AFTER coding and aptitude, so a behavioural question that also reads
   as a problem ("tell me about a time you optimised it") lands on 'coding'. That
   costs nothing: intent picks the model and the token ceiling, never the answer
   shape — the prompt routes itself to INTRODUCTION AND BEHAVIOURAL QUESTIONS
   from the question text — and both intents escalate to the same model anyway.

   Hinglish is here for the reason it is in CODING: an interviewer saying "apne
   baare me batao" is an ordinary event in the rooms this app is used in. */
const INTRO = [
  /\btell\s+(me|us)\s+about\s+(your\s*self|yourself)\b/,
  /\b(introduce\s+your\s*self|your\s+introduction|give\s+(me|us)\s+(your|a\s+brief)\s+intro)\b/,
  /\bwalk\s+(me|us)\s+through\s+(your|the)\s+(resume|cv|background|profile|journey|career)\b/,
  /\bbrief\s+(me\s+)?about\s+your\s*self\b/,

  // Behavioural. "tell me about a time" is the canonical opener; the others are
  // the same question wearing different clothes.
  /\btell\s+(me|us)\s+about\s+a\s+time\b/,
  /\bgive\s+(me|us)\s+an?\s+example\s+of\s+a\s+time\b/,
  /\bdescribe\s+a\s+(situation|time|project)\s+(where|when)\b/,
  /\bhow\s+do\s+you\s+(handle|deal\s+with|manage)\b/,

  // The fixed set every interview closes with.
  /\bwhy\s+(this\s+company|do\s+you\s+want\s+to\s+(join|work)|should\s+we\s+hire\s+you|us\b)/,
  // Both plurals, and they are not the same suffix: "strengths", "weaknesses".
  /\b(biggest|greatest)\s+(strengths?|weakness(es)?)\b/,
  /\bwhere\s+do\s+you\s+see\s+yourself\b/,
  /\bwhy\s+(are\s+you\s+)?(leaving|looking\s+for\s+a\s+change)\b/,

  // Hinglish
  /\b(apne|apna|khud\s+ke)\s+(baare|bare)\s+me(i?n)?\s+(batao|bataiye|bolo|kuch)\b/,
  /\bapna\s+(introduction|intro|parichay)\b/,
  /\bapne\s+aap\s+ko\s+introduce\b/,
]

const has = (list, s) => list.some((re) => re.test(s))

/**
 * @param {string} text - one transcribed or typed question
 * @returns {'coding'|'aptitude'|'intro'|'general'}
 */
export function classifyQuestion(text) {
  if (typeof text !== 'string') return 'general'

  /* Lower-cased and whitespace-collapsed, but NOT stripped of punctuation:
     several patterns above lean on `%` and on word boundaries that punctuation
     provides. */
  const s = text.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!s) return 'general'

  // CODING first. "find the minimum in this array" matches both lists, and it is
  // a coding problem — the aptitude patterns are the looser of the two.
  if (has(CODING, s)) return 'coding'
  if (has(APTITUDE, s)) return 'aptitude'
  // SELF-INTRO 2026-09-06: last of the three, deliberately — see the note above.
  if (has(INTRO, s)) return 'intro'
  return 'general'
}
