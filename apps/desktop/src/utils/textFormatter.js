/* SEGMENTATION 2026-08-30 ─────────────────────────────────────────────────────
   Joining the pieces of a question that was asked across a pause.

   This file was a 0-byte stub. It holds the one piece of text handling the
   aggregator needs and nothing else: given two fragments the VAD closed
   separately, produce the single line that goes to the model.

   Importless, like utterance.js and for the same reason — the replay harness
   runs these under bare node.  */

/** A fragment the transcriber cut mid-word ends on a hyphen or an ellipsis. */
const OPEN_TAIL = /[-–—]$|\.\.\.$|…$/u

/** Punctuation that should not survive being followed by more of the sentence. */
const WEAK_TAIL = /[,;:]$/u

/**
 * Joins a held fragment to its continuation.
 *
 * The rules are deliberately conservative. A wrong join produces a garbled
 * question, and the prompt's own instruction is to answer a garbled line rather
 * than refuse it — so a join that is merely ugly is far cheaper than one that is
 * confidently wrong.
 *
 * @param {string} a  what is already held
 * @param {string} b  the fragment that just arrived
 */
export function joinFragments(a, b) {
  const left  = (a || '').trim()
  const right = (b || '').trim()
  if (!left)  return right
  if (!right) return left

  // Cut mid-word: "inherit-" + "ance" is one word, not two. Drop the marker and
  // close the gap rather than leaving a hyphen inside the question.
  if (OPEN_TAIL.test(left)) {
    return left.replace(OPEN_TAIL, '') + right
  }

  // A trailing comma or colon was the transcriber punctuating a pause that has
  // turned out not to be the end of anything. Keep it — it is usually correct
  // mid-sentence — but never let it collide with punctuation opening the next
  // fragment.
  if (WEAK_TAIL.test(left) && /^[,;:.]/u.test(right)) {
    return `${left} ${right.replace(/^[,;:.]+\s*/u, '')}`
  }

  // A full stop the transcriber added at a hesitation is noise once the sentence
  // continues in lower case. "So what is." + "tell me about class" reads far
  // worse than the same line without it, and the model sees two sentences where
  // there was one.
  if (/[.]$/u.test(left) && /^\p{Ll}/u.test(right)) {
    return `${left.replace(/\.+$/u, '')} ${right}`
  }

  return `${left} ${right}`
}
