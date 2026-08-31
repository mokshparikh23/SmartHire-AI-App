/* SELF-VOICE 2026-08-31 ─────────────────────────────────────────────────────────
   The backstop against bleed, and only the backstop.

   With two microphones open — system loopback for the interviewer, the built-in
   mic for the candidate — a candidate on SPEAKERS rather than headphones has the
   interviewer's voice coming out of those speakers and straight back into their
   own mic. The same sentence then arrives on both streams, and the second copy
   would be tagged [SAID]: the model would be told the candidate said, out loud,
   the words the interviewer had just spoken. That is the worst failure this
   feature can produce, because it is confidently wrong rather than merely
   missing.

   THIS IS THE THIRD LAYER, NOT THE FIRST. In order of how cheaply they work:

     1. Chromium's own AEC. getUserMedia is acquired with echoCancellation: true
        (see acquire() in hooks/useVoice.js), which is referenced against system
        output and removes most of it before anything here runs.
     2. A temporal gate in useSelfVoice: self speech that BEGINS while the
        interviewer is speaking is discarded outright. Whether someone is talking
        right now is free, instant and language-independent — the same argument
        utteranceAggregator.js makes at the top of the file.
     3. This. Text overlap, for what survives both.

   And a fourth that is not code: headphones make all of it moot, which is why
   the UI says so.

   DELIBERATELY ALMOST IMPORTLESS, exactly as utils/utterance.js is and for the
   same reason: scripts/segment-replay.mjs is the only way any of this is
   exercised without a licence, a microphone and a live interview. The one import
   is normalizeUtterance, which is itself importless.  */

import { normalizeUtterance } from './utterance.js'

/* Character trigrams, not equality. The two streams are transcribed from
   different audio — different gain, different processing, an echo path in
   between — so the copies are rarely identical. "What is a closure in
   JavaScript" and "what is a closure in javascript" differ; so do "…in
   JavaScript" and "…in Java script". */
const N = 3

/* Above this share of the SHORTER text's trigrams appearing in the longer one,
   the two are the same utterance.

   0.6 rather than something stricter: a false negative here lets the
   interviewer's words into the prompt as the candidate's, which is the failure
   that matters. A false positive drops one line of context, which costs almost
   nothing — [SAID] is context, never a question, and the next thing the
   candidate says replaces it. Asymmetric costs, asymmetric threshold. */
const OVERLAP = 0.6

/* Below this many trigrams there is not enough text for the ratio to mean
   anything: "okay" against "okay then" would be a perfect match on one trigram.
   Short self lines are let through — they are also the least damaging to get
   wrong, since a stray "mm hm" tells the model nothing either way. */
const MIN_GRAMS = 4

/** Character trigrams of the normalised text. */
function grams(text) {
  const t = normalizeUtterance(text)
  if (t.length < N) return null
  const out = new Set()
  for (let i = 0; i + N <= t.length; i++) out.add(t.slice(i, i + N))
  return out
}

/**
 * How much of the shorter text appears in the longer one, 0..1.
 *
 * Containment rather than Jaccard: a short echo of a long question is still an
 * echo, and Jaccard would score that pair low simply because the lengths differ.
 * Containment is what "is this text inside that text" actually asks.
 */
export function overlapRatio(a, b) {
  const ga = grams(a)
  const gb = grams(b)
  if (!ga || !gb) return 0

  const [small, large] = ga.size <= gb.size ? [ga, gb] : [gb, ga]
  if (small.size < MIN_GRAMS) return 0

  let hits = 0
  for (const g of small) if (large.has(g)) hits++
  return hits / small.size
}

/**
 * Is this self-captured line an echo of something the other side just said?
 *
 * @param {string}   text    the candidate's transcribed line
 * @param {string[]} recent  what the other side said in the overlapping window
 * @returns {boolean}
 */
export function isEcho(text, recent = []) {
  if (!text) return false
  for (const other of recent) {
    if (overlapRatio(text, other) >= OVERLAP) return true
  }
  return false
}

export const DEDUPE_DEFAULTS = { N, OVERLAP, MIN_GRAMS }
