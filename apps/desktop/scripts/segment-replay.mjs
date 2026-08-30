/* SEGMENTATION 2026-08-30 ─────────────────────────────────────────────────────
   The replay harness for utterance segmentation.

   There is no test runner in either workspace — no `test` script, no test
   directory, no runner config, and the only @playwright/test string in the tree
   is an optional peer dependency of `next` that is not installed. Introducing a
   runner to a repo with zero tests is a bigger decision than this change should
   be making, so this is deliberately a plain node script: no dependency, no
   config, `npm run test:segment`, non-zero exit on failure. Node 22 is already
   pinned in CI and ships node:test if this ever wants more structure.

   THE CLOCK AND THE TIMERS ARE FAKE. createUtteranceAggregator takes now(),
   setTimer() and clearTimer() as inputs precisely so this file can supply a
   virtual clock, which is why a twenty-second scenario runs in well under a
   millisecond and always produces the same answer. Nothing here sleeps.

   WHAT THIS COVERS AND WHAT IT DOES NOT. It exercises the state machine and the
   scorer — the two places all the new decisions live. It does NOT exercise the
   RMS VAD, the adaptive noise floor, real WebRTC delta timing or any UI; those
   need the audio-fixture path described in the plan. Tier 1 validates the
   logic; only real audio validates the constants.  */

import assert from 'node:assert/strict'
import { createUtteranceAggregator } from '../src/utils/utteranceAggregator.js'
import { scoreCompleteness, VERDICT } from '../src/utils/completeness/index.js'

/* ── virtual clock ───────────────────────────────────────────────────────── */

function makeClock() {
  let t = 0
  let nextId = 1
  const timers = new Map()

  return {
    now: () => t,
    setTimer(ms, fn) { const id = nextId++; timers.set(id, { at: t + ms, fn }); return id },
    clearTimer(id) { timers.delete(id) },
    /** Runs every timer due at or before `target`, in order, moving the clock. */
    advanceTo(target) {
      for (;;) {
        let dueId = null
        let dueAt = Infinity
        for (const [id, timer] of timers) {
          if (timer.at <= target && timer.at < dueAt) { dueAt = timer.at; dueId = id }
        }
        if (dueId === null) break
        const { fn } = timers.get(dueId)
        timers.delete(dueId)
        t = dueAt
        fn()
      }
      if (target > t) t = target
    },
  }
}

/**
 * Drives one scenario and returns everything the aggregator emitted.
 *
 * Events are absolute-time and mirror what the two capture hooks actually call:
 *   { at, speechStart: true }
 *   { at, speechEnd: true }
 *   { at, text, speechStartedAt, speechEndedAt, speechMs }
 */
function run(events, opts = {}) {
  const clock = makeClock()
  const emitted = []

  const agg = createUtteranceAggregator({
    emit: (u) => emitted.push(u),
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    score: opts.score,
    tuning: opts.tuning,
  })

  const ordered = [...events].sort((a, b) => a.at - b.at)
  for (const e of ordered) {
    clock.advanceTo(e.at)
    if (e.speechStart) agg.noteSpeechStart(e.at)
    else if (e.speechEnd) agg.noteSpeechEnd(e.at)
    else agg.pushFragment(e.text, e)
  }

  // Let every outstanding hold resolve. Well past maxHoldMs and maxUtteranceMs.
  clock.advanceTo((ordered[ordered.length - 1]?.at || 0) + 60000)
  return emitted
}

/** One spoken burst: the start edge, the end edge, and the transcript that follows. */
function burst({ text, from, to, transcriptAt, silenceMs = 700 }) {
  return [
    { at: from, speechStart: true },
    { at: to + silenceMs, speechEnd: true },
    {
      at: transcriptAt ?? to + silenceMs,
      text,
      speechStartedAt: from,
      speechEndedAt: to,
      speechMs: to - from,
    },
  ]
}

/* ── fixtures ────────────────────────────────────────────────────────────── */

let failures = 0
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`) }
  catch (e) { failures++; console.error(`  FAIL ${name}\n       ${e.message}`) }
}

console.log('\nsegment-replay\n')

/* 1 — the reported bug. Segmented path: the transcript lands ~700ms after the
      audio, so fragment 1 arrives while the speaker is already mid-continuation. */
check('reported bug: "So what is" [pause] "tell me about class" -> ONE emit', () => {
  const out = run([
    ...burst({ text: 'So what is',                       from: 0,    to: 900,  transcriptAt: 2250 }),
    ...burst({ text: 'tell me about class in C sharp',   from: 2000, to: 3600, transcriptAt: 5000 }),
  ])
  assert.equal(out.length, 1, `expected 1 emit, got ${out.length}: ${JSON.stringify(out.map((o) => o.text))}`)
  assert.match(out[0].text, /So what is tell me about class in C sharp/)
  assert.equal(out[0].fragments, 2)
})

/* 2 — two genuinely separate questions must stay separate. */
check('two complete questions 2.2s apart -> TWO emits', () => {
  const out = run([
    ...burst({ text: 'What is a class in C sharp?',      from: 0,    to: 1500 }),
    ...burst({ text: 'What is a struct in C sharp?',     from: 4400, to: 6000 }),
  ])
  assert.equal(out.length, 2, `expected 2 emits, got ${out.length}`)
  assert.equal(out[0].verdict, VERDICT.COMPLETE)
  assert.equal(out[1].verdict, VERDICT.COMPLETE)
})

/* 3 — the speaker trailed off and never came back. */
check('dangling then silence -> one emit at the hold cap', () => {
  const out = run(burst({ text: 'So what is', from: 0, to: 900, transcriptAt: 2250 }))
  assert.equal(out.length, 1)
  assert.equal(out[0].text, 'So what is')
  assert.ok(out[0].heldMs > 0, 'a dangling fragment must have waited')
})

/* 4 — three fragments, two pauses. */
check('three-way pause -> ONE emit', () => {
  const out = run([
    ...burst({ text: 'Can you explain',        from: 0,    to: 800,  transcriptAt: 2000 }),
    ...burst({ text: 'the difference between', from: 1800, to: 2900, transcriptAt: 4200 }),
    ...burst({ text: 'a class and a struct',   from: 4000, to: 5200, transcriptAt: 6500 }),
  ])
  assert.equal(out.length, 1, `expected 1 emit, got ${out.length}: ${JSON.stringify(out.map((o) => o.text))}`)
  assert.equal(out[0].fragments, 3)
  assert.match(out[0].text, /Can you explain the difference between a class and a struct/)
})

/* 5 — a speaker who never pauses. useLiveVoice had no bound on this at all. */
check('continuous talker -> bounded by maxUtteranceMs', () => {
  const events = [{ at: 0, speechStart: true }]
  // MAX_SEGMENT_MS cuts every 12s while speech never drops below threshold.
  for (let i = 1; i <= 4; i++) {
    events.push({
      at: i * 12000, text: `and then we rebuilt the whole indexing layer part ${i}`,
      speechStartedAt: (i - 1) * 12000, speechEndedAt: i * 12000, speechMs: 12000,
    })
  }
  const out = run(events)
  assert.ok(out.length >= 1, 'a continuous talker must still emit')
  for (const u of out) {
    const span = u.speechEndedAt - u.speechStartedAt
    assert.ok(span <= 30000, `utterance span ${span}ms is unbounded`)
  }
})

/* 6 — a cough transcribes to a filler or to nothing. */
check('filler-only fragment -> no emit', () => {
  assert.equal(run(burst({ text: 'haan', from: 0, to: 300 })).length, 0)
  assert.equal(run(burst({ text: 'Thank you.', from: 0, to: 300 })).length, 0)
  assert.equal(run(burst({ text: 'ठीक है', from: 0, to: 300 })).length, 0)
  assert.equal(run(burst({ text: 'સારું', from: 0, to: 300 })).length, 0)
})

/* 7 — a hesitation inside a held question is evidence, not content. */
check('filler mid-hold -> held, and absent from the emitted text', () => {
  const out = run([
    ...burst({ text: 'tell me about', from: 0,    to: 800,  transcriptAt: 1900 }),
    ...burst({ text: 'umm',           from: 1700, to: 1950, transcriptAt: 2900 }),
    ...burst({ text: 'closures',      from: 2800, to: 3600, transcriptAt: 4700 }),
  ])
  assert.equal(out.length, 1, `expected 1 emit, got ${out.length}: ${JSON.stringify(out.map((o) => o.text))}`)
  assert.ok(!/umm/i.test(out[0].text), `filler leaked into the prompt: "${out[0].text}"`)
  assert.match(out[0].text, /tell me about closures/)
})

/* 8 — a transcript that overtook its predecessor is logged, not reordered
      silently. useVoice serialises so this should never fire in practice. */
check('backwards timestamps still produce one utterance', () => {
  const out = run([
    { at: 0, speechStart: true },
    { at: 1600, speechEnd: true },
    { at: 2400, text: 'what is the difference between', speechStartedAt: 0, speechEndedAt: 900 },
    { at: 2500, text: 'a class and a struct',           speechStartedAt: 1000, speechEndedAt: 1500 },
  ])
  assert.equal(out.length, 1)
  assert.match(out[0].text, /what is the difference between a class and a struct/)
})

/* 9–11 — the language packs. Each is a tail-only judgement. */
check('Devanagari dangling tail (…के बारे में) -> DANGLING', () => {
  const v = scoreCompleteness('C# में multiple inheritance के बारे में')
  assert.equal(v.verdict, VERDICT.DANGLING, `got ${v.verdict} (${v.reason})`)
  assert.equal(v.lang, 'hi')
})

check('romanized Hinglish, same phrase -> DANGLING', () => {
  const v = scoreCompleteness('C# me multiple inheritance ke baare me')
  assert.equal(v.verdict, VERDICT.DANGLING, `got ${v.verdict} (${v.reason})`)
  assert.equal(v.lang, 'hinglish')
})

check('Hinglish SOV complete tail (…batao) -> COMPLETE', () => {
  const v = scoreCompleteness('C# me multiple inheritance ke baare me batao')
  assert.equal(v.verdict, VERDICT.COMPLETE, `got ${v.verdict} (${v.reason})`)
})

check('Gujarati SOV complete tail (…સમજાવો) -> COMPLETE', () => {
  const v = scoreCompleteness('શું તમે inheritance સમજાવો')
  assert.equal(v.verdict, VERDICT.COMPLETE, `got ${v.verdict} (${v.reason})`)
})

check('English trailing auxiliary -> DANGLING', () => {
  assert.equal(scoreCompleteness('So what is').verdict, VERDICT.DANGLING)
  assert.equal(scoreCompleteness('tell me about the').verdict, VERDICT.DANGLING)
})

/* 12 — an unrecognised language must never inherit COMPLETE's never-wait path. */
check('unknown language -> OPEN, never COMPLETE', () => {
  const v = scoreCompleteness('γεια σου τι κανεις σημερα φιλε')
  assert.notEqual(v.verdict, VERDICT.COMPLETE, `got ${v.verdict} (${v.reason})`)
})

/* 13 — the guarantee that this ships useful before any word list is trusted. */
check('zero language packs -> the structural rules still carry the bug', () => {
  const structural = (text, o = {}) => scoreCompleteness(text, { ...o, packs: [] })

  const one = run([
    ...burst({ text: 'So what is',                     from: 0,    to: 900,  transcriptAt: 2250 }),
    ...burst({ text: 'tell me about class in C sharp', from: 2000, to: 3600, transcriptAt: 5000 }),
  ], { score: structural })
  assert.equal(one.length, 1, `expected 1 emit with no packs, got ${one.length}`)

  const two = run([
    ...burst({ text: 'What is a class in C sharp?',  from: 0,    to: 1500 }),
    ...burst({ text: 'What is a struct in C sharp?', from: 4400, to: 6000 }),
  ], { score: structural })
  assert.equal(two.length, 2, `expected 2 emits with no packs, got ${two.length}`)
})

/* 14 — the regression guard. This is the one that must fail loudest. */
check('LATENCY: a COMPLETE question is never held', () => {
  const complete = [
    'What is a class in C sharp?',
    'How does garbage collection work?',
    'C# me multiple inheritance ke baare me batao',
    'શું તમે inheritance સમજાવો',
  ]
  for (const text of complete) {
    const out = run(burst({ text, from: 0, to: 1500 }))
    assert.equal(out.length, 1, `"${text}" produced ${out.length} emits`)
    assert.equal(out[0].verdict, VERDICT.COMPLETE, `"${text}" scored ${out[0].verdict}`)
    assert.equal(out[0].heldMs, 0, `"${text}" was held for ${out[0].heldMs}ms — the fast path regressed`)
  }
})

/* Bounds. */
check('maxUtteranceChars caps a runaway stitch', () => {
  const events = [{ at: 0, speechStart: true }]
  for (let i = 0; i < 12; i++) {
    events.push({ at: 1000 + i * 900, speechStart: true })
    events.push({
      at: 1200 + i * 900, text: 'and then we rebuilt the indexing layer around it',
      speechStartedAt: 1000 + i * 900, speechEndedAt: 1150 + i * 900, speechMs: 150,
    })
  }
  const out = run(events)
  assert.ok(out.length >= 1)
  for (const u of out) assert.ok(u.chars <= 700, `emitted ${u.chars} chars`)
})

console.log(failures === 0 ? '\nall green\n' : `\n${failures} failing\n`)
process.exit(failures === 0 ? 0 : 1)
