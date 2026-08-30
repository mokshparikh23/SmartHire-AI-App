/* SEGMENTATION 2026-08-30 ─────────────────────────────────────────────────────
   Can this fragment be the end of a question?

   The answer decides how long the aggregator waits before spending an LLM call,
   and nothing else. A wrong COMPLETE costs a split question; a wrong DANGLING
   costs a second of latency. Those are not symmetric, so where the evidence is
   thin this returns OPEN and lets the timer be short rather than guessing.

   RESOLUTION ORDER, and why it is this order:

     1. A terminal ? ! । ॥ wins outright. It is the only signal a transcriber
        emits that means "this was a question and it is over", and it beats tail
        evidence — "What is inheritance for?" ends on a preposition and is
        plainly finished.
     2. A trailing comma or dash is the opposite signal, and just as explicit.
     3. Pack vote. Any matching pack that recognises the tail as un-endable wins.
     4. Fewer than MIN_COMPLETE_TOKENS words caps the verdict at OPEN. This one
        rule, with no word lists at all, is what fixes the reported case: "So
        what is" is three tokens.
     5. A terminal full stop, once past the token floor, is worth COMPLETE — but
        far less than a question mark, which is why it sits below the pack vote.
        Transcribers punctuate hesitations with it.
     6. Pack completeTail — the sentence-final verb that closes an SOV clause.
     7. Otherwise OPEN.

   DEGRADES TO SOMETHING USEFUL WITH NO PACKS AT ALL. Rules 1, 2, 4 and 5 are
   structural and language-independent, and they alone carry the reported bug and
   the ordinary English case. The packs are an upgrade, not a dependency.

   NEVER RETURNS COMPLETE FOR AN UNRECOGNISED LANGUAGE. A language no pack claims
   falls to OPEN, which is stitchable and briefly held. Inheriting COMPLETE's
   never-wait guarantee on text nothing understood is exactly the wrong default.  */

// Explicit .js, unlike the extensionless imports elsewhere in src/. Vite accepts
// both; bare node accepts only this one, and scripts/segment-replay.mjs imports
// this file directly. The extension is what makes the harness possible.
import { BUILTIN_PACKS } from './packs.js'

export const VERDICT = {
  DANGLING: 'dangling',   // cannot end here — hold long
  OPEN:     'open',       // no strong signal — hold briefly
  COMPLETE: 'complete',   // ends here — emit now, at today's latency
}

/** Below this, a fragment is never COMPLETE without explicit terminal punctuation. */
const MIN_COMPLETE_TOKENS = 4

/** A pack must clear this to vote at all. */
const MATCH_FLOOR = 0.3

const TERMINAL_STRONG = /[?!？！।॥]\s*$/u
const TERMINAL_WEAK   = /[.。]\s*$/u
const OPEN_PUNCT      = /[,;:\-–—]\s*$|\.\.\.\s*$|…\s*$/u

const packs = [...BUILTIN_PACKS]

/** Adds a pack at runtime. Later registrations vote alongside the built-ins. */
export function registerLanguagePack(pack) {
  if (pack?.id) packs.push(pack)
}

export function listLanguagePacks() {
  return packs.map((p) => p.id)
}

/**
 * Splits into comparable tokens: lowercased, stripped of edge punctuation.
 * Devanagari and Gujarati are space-separated, so whitespace is enough for all
 * four languages.
 *
 * \p{M} IS KEPT, and that is the whole subtlety. A matra is a combining mark,
 * not a letter, so an edge-strip written as [^\p{L}\p{N}] treats one as trailing
 * punctuation and eats it: "में" became "म" and "સમજાવો" became "સમજાવ", so every
 * Devanagari and Gujarati tail lookup missed and both languages silently scored
 * OPEN. The English and romanized packs were unaffected, which is exactly what
 * made it invisible — the harness is what caught it.
 */
export function tokenize(text) {
  return (text || '')
    .normalize('NFC')
    .toLowerCase()
    .split(/\s+/u)
    .map((t) => t.replace(/^[^\p{L}\p{N}\p{M}#+]+|[^\p{L}\p{N}\p{M}#+]+$/gu, ''))
    .filter(Boolean)
}

/**
 * @param   {string} text
 * @param   {{minCompleteTokens?: number, packs?: Array}} [opts]
 * @returns {{verdict: string, reason: string, lang: string|null,
 *            confidence: number, tokens: number, tail: string}}
 *
 * `opts.packs` overrides the registered set. It exists so the replay harness can
 * pass [] and prove the structural rules carry the reported bug on their own —
 * the guarantee that this ships useful before any word list is trusted.
 */
export function scoreCompleteness(text, opts = {}) {
  const minTokens = opts.minCompleteTokens ?? MIN_COMPLETE_TOKENS
  const active = opts.packs || packs
  const raw = (text || '').trim()
  const tokens = tokenize(raw)
  const tail = tokens[tokens.length - 1] || ''

  const base = { tokens: tokens.length, tail, lang: null, confidence: 0 }

  if (!tokens.length) {
    return { ...base, verdict: VERDICT.OPEN, reason: 'empty' }
  }

  // 1 — an explicit question mark is the strongest thing a transcriber says.
  if (TERMINAL_STRONG.test(raw)) {
    return { ...base, verdict: VERDICT.COMPLETE, reason: 'terminal-punct', confidence: 1 }
  }

  // 2 — and a trailing comma or dash is just as explicitly the opposite.
  if (OPEN_PUNCT.test(raw)) {
    return { ...base, verdict: VERDICT.DANGLING, reason: 'open-punct', confidence: 0.9 }
  }

  // 3 — pack vote. Packs CO-MATCH on purpose: a code-switched sentence is the
  // normal case here, not the exception, so the question is never "which
  // language is this" but "does anything that understands this text object".
  const voters = []
  for (const pack of active) {
    if (pack.script && !pack.script.test(raw)) continue
    const confidence = pack.match ? pack.match(tokens) : 1
    if (confidence >= MATCH_FLOOR) voters.push({ pack, confidence })
  }
  voters.sort((a, b) => b.confidence - a.confidence)

  const dangling = voters.find(({ pack }) => pack.danglingTail?.has(tail))
  if (dangling) {
    return {
      ...base,
      verdict: VERDICT.DANGLING,
      reason: 'dangling-tail',
      lang: dangling.pack.id,
      confidence: dangling.confidence,
    }
  }

  // 4 — the token floor. Language-independent, and on its own enough for the
  // fragment this whole mechanism was built for.
  if (tokens.length < minTokens) {
    return {
      ...base,
      verdict: VERDICT.OPEN,
      reason: 'too-few-tokens',
      lang: voters[0]?.pack.id || null,
      confidence: voters[0]?.confidence || 0,
    }
  }

  // 5 — a full stop, believed only now that nothing above objected.
  if (TERMINAL_WEAK.test(raw)) {
    return {
      ...base,
      verdict: VERDICT.COMPLETE,
      reason: 'weak-terminal-punct',
      lang: voters[0]?.pack.id || null,
      confidence: 0.6,
    }
  }

  // 6 — the sentence-final verb. This is what closes a Hindi or Gujarati
  // question, and it is why those packs carry a completeTail at all while the
  // English one is empty.
  const complete = voters.find(({ pack }) => pack.completeTail?.has(tail))
  if (complete) {
    return {
      ...base,
      verdict: VERDICT.COMPLETE,
      reason: 'complete-tail',
      lang: complete.pack.id,
      confidence: complete.confidence,
    }
  }

  // 7 — nothing objected and nothing vouched.
  return {
    ...base,
    verdict: VERDICT.OPEN,
    reason: voters.length ? 'no-signal' : 'no-pack',
    lang: voters[0]?.pack.id || null,
    confidence: voters[0]?.confidence || 0,
  }
}
