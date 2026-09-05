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
   apps/web/lib/ai.js says so outright — "English, Hindi, Gujarati or a mix, with
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

const has = (list, s) => list.some((re) => re.test(s))

/**
 * @param {string} text - one transcribed or typed question
 * @returns {'coding'|'aptitude'|'general'}
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
  return 'general'
}
