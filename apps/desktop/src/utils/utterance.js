/* MULTILINGUAL 2026-08-30 ─────────────────────────────────────────────────────
   One admission gate, two callers.

   useVoice.js:99 and useLiveVoice.js:43 held byte-identical copies of a filler
   regex and a length floor, and both copies were English-only:

     const FILLER = /^(thank you|thanks|okay|ok|yes|no|yeah|hmm+|uh+|um+|mm+|\.+)$/i
     const MIN_TEXT_CHARS = 3

   Questions in this product arrive in English, Hindi, Gujarati and Hinglish, so
   "haan", "ठीक है" and "સારું" each passed straight through and bought a full
   answer: a metered request, a round trip, and the overlay filled with a reply
   to a grunt.

   TWO BUGS FOUND WHILE MOVING IT.

   1. The old pattern was anchored ^…$ and stripped nothing, so a transcript of
      "Thank you." — with the full stop the transcriber actually emits — never
      matched "thank you" and cost an answer every single time. The list was
      largely decorative on real input. normalizeUtterance() is what makes it
      work at all.

   2. MIN_TEXT_CHARS = 3 counts UTF-16 code units, which means something
      different in every script this now has to read. "हाँ" is three code units
      (ह + ा + ँ) and one syllable, so the floor waved through a bare "yes" as
      though it were three characters of a question. Counting BASE letters —
      combining marks stripped — makes the floor mean the same thing everywhere,
      and the Indic minimum can then honestly be lower, because two base letters
      of Devanagari carry about as much as three of Latin.

   DELIBERATELY IMPORTLESS. scripts/segment-replay.mjs and a bare `node -e` are
   the only ways any of this is exercised without a licence, a microphone and a
   live interview. Anything this file imports is something a test has to stand
   up first. Keep it at zero.  */

/**
 * NFC, lowercased, collapsed whitespace, and stripped of punctuation at both
 * ends — including the danda (।) and double danda (॥), which end a Devanagari
 * sentence the way a full stop ends an English one.
 */
export function normalizeUtterance(text) {
  return (typeof text === 'string' ? text : '')
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .replace(/^[\s.,;:!?…।॥"'“”‘’()\-]+|[\s.,;:!?…।॥"'“”‘’()\-]+$/gu, '')
    .trim()
    .toLowerCase()
}

/* Acknowledgements, not questions.

   The English set is the original, unchanged. Everything after it is Hindi and
   Gujarati in BOTH the romanized and the native form, because which one arrives
   depends on which transcription path served the utterance and on what the
   speaker mixed in — the same word reaches us as "haan" from a Hinglish turn and
   as "हाँ" from a Hindi one.

   ANCHORED WHOLE-STRING, so nothing here can swallow a real question that merely
   begins with one of these words. Entries are single acknowledgements only:
   nothing that could plausibly be a one-word technical term.

   `\.+` from the original is not carried over — normalizeUtterance strips a
   run of dots to the empty string, and isSubstantive's letter floor rejects it
   before this list is ever consulted. */
const FILLER_WORDS = [
  // English — the original list
  'thank you', 'thanks', 'okay', 'ok', 'yes', 'no', 'yeah', 'yep', 'nope',
  'hmm+', 'uh+', 'um+', 'mm+', 'huh',
  // Hindi / Urdu / Gujarati, romanized — how they arrive on a Hinglish turn
  'haan', 'haan ji', 'ha', 'han', 'hn+', 'ji', 'ji haan', 'ji ha',
  'nahi', 'nahin', 'nai', 'na', 'naa',
  'acha', 'accha', 'achha', 'achcha', 'acchha',
  'thik', 'theek', 'thik hai', 'theek hai', 'sahi', 'sahi hai',
  'bilkul', 'barabar', 'saru', 'saru che',
  'bas', 'arre', 'arey', 'are', 'chalo', 'chaalo',
  'shukriya', 'dhanyavad', 'dhanyavaad', 'aabhar', 'ok ji', 'okay ji',
  // Devanagari
  'हाँ', 'हां', 'हा', 'जी', 'जी हाँ', 'जी हां', 'नहीं', 'नही', 'ना',
  'अच्छा', 'ठीक', 'ठीक है', 'सही', 'सही है', 'बिल्कुल', 'बराबर',
  'बस', 'अरे', 'चलो', 'हम्म+', 'धन्यवाद', 'शुक्रिया', 'ओके',
  // Gujarati
  'હા', 'હા જી', 'જી', 'ના', 'સારું', 'સારુ', 'બરાબર', 'ઠીક', 'ઠીક છે',
  'અચ્છા', 'બસ', 'અરે', 'ચાલો', 'હમ્મ+', 'આભાર', 'ધન્યવાદ', 'ઓકે',
]

const FILLER = new RegExp(`^(?:${FILLER_WORDS.join('|')})$`, 'iu')

/* "matlab" and "मतलब" are deliberately NOT in the list above. On their own they
   are a filler, but they are also the single most common way a Hinglish speaker
   opens a clarification — "matlab yeh kaise kaam karta hai" — and the length
   floor already drops the bare form. Keeping them out costs one dropped grunt;
   putting them in would risk an anchored match on a normalized fragment. */

const MIN_LATIN_LETTERS = 3
const MIN_INDIC_LETTERS = 2

const COMBINING  = /\p{M}/gu
const NON_LETTER = /[^\p{L}\p{N}]/gu
const INDIC      = /[ऀ-ॿ઀-૿]/u   // Devanagari, Gujarati

/** True when the text carries enough base letters to be worth a round trip. */
export function isSubstantive(text) {
  const t = normalizeUtterance(text)
  if (!t) return false
  const letters = t.replace(COMBINING, '').replace(NON_LETTER, '')
  return letters.length >= (INDIC.test(t) ? MIN_INDIC_LETTERS : MIN_LATIN_LETTERS)
}

/** True when the whole utterance is a bare acknowledgement. */
export function isFiller(text) {
  const t = normalizeUtterance(text)
  return t !== '' && FILLER.test(t)
}

/**
 * The gate both capture paths run before an utterance is worth an answer.
 * Handles undefined, so the caller's own empty check folds into it.
 */
export function worthAnswering(text) {
  return isSubstantive(text) && !isFiller(text)
}

/* SELF-VOICE 2026-08-31 ─ the desktop mirror of lib/resume.js's CONTROL_TAGS ───
   Every user message sent to the model is prefixed with a tag that tells it who
   spoke — [HEARD] the interviewer, [SAID] the candidate, [TYPED] the keyboard.
   The model is instructed to read that tag FIRST and to treat what follows
   accordingly, so text containing a tag is text that can rewrite who said it.

   The web app already strips these from résumés, which is where the risk is
   largest and where the class of bug has already occurred once. This closes the
   other door: text that arrives through the transcript. It is unlikely from
   speech — a transcriber has little reason to emit square brackets — but
   "unlikely" is not a security property, and the typed transcript bar and the
   chat composer are plain text fields where it is not unlikely at all.

   Strips only, never rejects: a question is still a question with a stray tag
   removed from it, and dropping the utterance would be a worse failure than
   answering a slightly shortened one.

   Kept in step with lib/resume.js's copy BY HAND — there is no shared package
   between the two workspaces. Change one, change both. */
const CONTROL_TAGS = /\[(?:HEARD|SAID|TYPED|INTERVIEWER|SCREENSHOT)\]/gi

export function stripControlTags(text) {
  return typeof text === 'string' ? text.replace(CONTROL_TAGS, '').trim() : text
}
