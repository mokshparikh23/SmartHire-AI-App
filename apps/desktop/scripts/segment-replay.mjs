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
// PIPELINE 2026-08-31: SEGMENT_DEFAULTS imported so the bounds fixtures assert
// against the constants themselves rather than against numbers copied out of
// them, which is how case 5's `span <= 30000` silently stopped meaning anything.
// import { createUtteranceAggregator } from '../src/utils/utteranceAggregator.js'
import { createUtteranceAggregator, SEGMENT_DEFAULTS } from '../src/utils/utteranceAggregator.js'
import { scoreCompleteness, VERDICT } from '../src/utils/completeness/index.js'
// SELF-VOICE 2026-08-31: the echo backstop. Pure and near-importless by design,
// precisely so it can be driven here without a microphone.
import { isEcho } from '../src/utils/speakerDedupe.js'
// PREMIUM-UX 2026-08-31: the markdown parser is split out of Markdown.jsx for
// exactly this — plain node cannot parse JSX, and the streaming behaviour is
// where the risk is.
import { parseBlocks, splitInline } from '../src/utils/markdown.js'

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
    // PIPELINE 2026-08-31: the close reason rides along, exactly as the capture
    // hooks now pass it. Defaulted to 'silence' in burst() below, so every
    // pre-existing fixture drives the aggregator byte-identically.
    // else if (e.speechEnd) agg.noteSpeechEnd(e.at)
    else if (e.speechEnd) agg.noteSpeechEnd(e.at, e.endReason || 'silence')
    else agg.pushFragment(e.text, e)
  }

  // Let every outstanding hold resolve. Well past maxHoldMs and maxUtteranceMs.
  clock.advanceTo((ordered[ordered.length - 1]?.at || 0) + 60000)
  return emitted
}

/** One spoken burst: the start edge, the end edge, and the transcript that follows. */
// PIPELINE 2026-08-31: endReason added, defaulting to 'silence' so no existing
// fixture changes. 'max-segment' is what the recorder reports when it ran out of
// segment while the speaker was STILL talking.
// function burst({ text, from, to, transcriptAt, silenceMs = 700 }) {
function burst({ text, from, to, transcriptAt, silenceMs = 700, endReason = 'silence' }) {
  return [
    { at: from, speechStart: true },
    { at: to + silenceMs, speechEnd: true, endReason },
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
  /* PIPELINE 2026-08-31: re-based on maxUtteranceSpeechMs, the constant that now
     actually bounds this case. 30000 was a number picked to sit under the old
     single 15s wall cap measured from speech start; that cap now measures from
     ARRIVAL and cannot bound elapsed speech at all. */
  // assert.ok(span <= 30000, `utterance span ${span}ms is unbounded`)
  for (const u of out) {
    const span = u.speechEndedAt - u.speechStartedAt
    assert.ok(span <= SEGMENT_DEFAULTS.maxUtteranceSpeechMs,
      `utterance span ${span}ms exceeds maxUtteranceSpeechMs`)
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
  /* PIPELINE 2026-08-31: 12 -> 40 fragments, and 900ms -> 300ms apart. At 48
     chars each, twelve joined to ~588 — comfortably under the OLD 600 cap, so
     this fixture stopped exercising the cap the moment it was written. And at
     900ms apart the 20s wall budget elapses after ~22 fragments, so cap-ms wins
     the race and the character cap still never fires. Both numbers had to move. */
  // for (let i = 0; i < 12; i++) {
  //   events.push({ at: 1000 + i * 900, speechStart: true })
  for (let i = 0; i < 40; i++) {
    events.push({ at: 1000 + i * 300, speechStart: true })
    events.push({
      at: 1150 + i * 300, text: 'and then we rebuilt the indexing layer around it',
      speechStartedAt: 1000 + i * 300, speechEndedAt: 1100 + i * 300, speechMs: 100,
    })
  }
  const out = run(events)
  assert.ok(out.length >= 1)
  // One fragment of slack: the cap is checked AFTER the join, so the emitted
  // text may overshoot by at most the fragment that crossed it.
  // for (const u of out) assert.ok(u.chars <= 700, `emitted ${u.chars} chars`)
  const ceiling = SEGMENT_DEFAULTS.maxUtteranceChars + 100
  for (const u of out) assert.ok(u.chars <= ceiling, `emitted ${u.chars} chars, ceiling ${ceiling}`)
  assert.ok(out.some((u) => u.reason === 'cap-chars'),
    `no emit was attributed to cap-chars: ${JSON.stringify(out.map((u) => u.reason))}`)
})

/* PIPELINE 2026-08-31 ─ the merge path and the re-measured caps ───────────────
   Everything below covers the change that stops a long question becoming three
   or four separate LLM calls. Cases B and F are load-bearing: they are what
   makes noteSpeechEnd's 'max-segment' behaviour safe to ship, because with
   `speaking` no longer falsified, maxHoldMs stops bounding a continuous talker
   and these two caps become the only bounds that remain. */

/* A — the reported long-question bug, end to end. A 40s question that the
      recorder chops into four segments must arrive as ONE question, either
      stitched or explicitly chained — never as four unrelated ones that each
      abort the previous answer. */
check('a 40s chopped question chains rather than splitting', () => {
  const out = run([
    { at: 0, speechStart: true },
    { at: 12000, speechEnd: true, endReason: 'max-segment' },
    { at: 13500, text: 'So the system we are building has three services and',
      speechStartedAt: 0, speechEndedAt: 12000, speechMs: 12000 },
    { at: 12100, speechStart: true },
    { at: 24000, speechEnd: true, endReason: 'max-segment' },
    { at: 25500, text: 'each of them writes to the same postgres table which',
      speechStartedAt: 12000, speechEndedAt: 24000, speechMs: 12000 },
    { at: 24100, speechStart: true },
    { at: 36000, speechEnd: true, endReason: 'max-segment' },
    { at: 37500, text: 'means we get lock contention under load and',
      speechStartedAt: 24000, speechEndedAt: 36000, speechMs: 12000 },
    { at: 36100, speechStart: true },
    { at: 40700, speechEnd: true },
    { at: 42000, text: 'how would you fix that?',
      speechStartedAt: 36000, speechEndedAt: 40000, speechMs: 4000 },
  ])

  assert.ok(out.length >= 1, 'the question must reach the model at all')
  const joined = out.map((u) => u.text).join(' ')
  assert.match(joined, /three services/)
  assert.match(joined, /how would you fix that\?/)

  // Every emit after the first must be flagged as an extension of the one
  // before it — that is what stops generate() treating it as a new question.
  for (let i = 1; i < out.length; i++) {
    assert.equal(out[i].continues, out[i - 1].id,
      `emit ${i} (${out[i].reason}) did not chain to its predecessor`)
    assert.equal(out[i - 1].final, false,
      `emit ${i - 1} was marked final despite being cut mid-question`)
  }
  assert.equal(out[out.length - 1].final, true, 'the closing fragment must be final')
})

/* B — the guard for noteSpeechEnd's 'max-segment' arm. A recorder cut while the
      speaker is still above threshold must NOT start the maxHoldMs ceiling. */
check('a max-segment cut does not falsify `speaking`', () => {
  const clock = makeClock()
  const emitted = []
  const agg = createUtteranceAggregator({
    emit: (u) => emitted.push(u),
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  })

  agg.noteSpeechStart(0)
  clock.advanceTo(12000)
  agg.noteSpeechEnd(12000, 'max-segment')
  clock.advanceTo(13500)
  agg.pushFragment('So the system we are building has three services and', {
    speechStartedAt: 0, speechEndedAt: 12000, speechMs: 12000,
  })

  // Well past 700 + maxHoldMs. If the cut had been reported as a real speech
  // end, the hold ceiling would have expired here and emitted the stub.
  clock.advanceTo(20000)
  assert.equal(emitted.length, 0,
    `emitted mid-sentence: ${JSON.stringify(emitted.map((u) => u.text))}`)
  assert.equal(agg.inspect().speaking, true, '`speaking` was cleared by a recorder cut')
})

/* C — the exact regression the re-measured cap exists to fix. Slow
      transcription must not consume the utterance budget. */
check('transcription latency no longer eats the utterance budget', () => {
  // 4s upload on a 12s segment. Under the OLD cap (15s from speech START) this
  // arrived at 16000 already over budget and emitted instantly, unstitched.
  const out = run([
    { at: 0, speechStart: true },
    { at: 12000, speechEnd: true, endReason: 'max-segment' },
    { at: 16000, text: 'can you walk me through how you would',
      speechStartedAt: 0, speechEndedAt: 12000, speechMs: 12000 },
    { at: 12100, speechStart: true },
    { at: 17500, speechEnd: true },
    { at: 18000, text: 'design a rate limiter?',
      speechStartedAt: 12100, speechEndedAt: 16800, speechMs: 4700 },
  ])
  assert.equal(out.length, 1, `expected 1 stitched emit, got ${out.length}: ${JSON.stringify(out.map((u) => u.text))}`)
  assert.equal(out[0].fragments, 2, 'the two halves were not stitched')
  assert.match(out[0].text, /walk me through how you would design a rate limiter\?/)
})

/* D — a forced cut followed by a genuinely NEW question must not merge. */
check('a new question after a forced cut does not chain', () => {
  const out = run([
    ...(() => {
      const events = [{ at: 0, speechStart: true }]
      for (let i = 0; i < 40; i++) {
        events.push({ at: 100 + i * 300, speechStart: true })
        events.push({
          at: 200 + i * 300, text: 'and then we rebuilt the indexing layer around it',
          speechStartedAt: 100 + i * 300, speechEndedAt: 150 + i * 300, speechMs: 50,
        })
      }
      return events
    })(),
    // Then silence far longer than continuationGapMs, then something unrelated.
    ...burst({ text: 'What is your notice period?', from: 40000, to: 41500 }),
  ])
  const last = out[out.length - 1]
  assert.match(last.text, /notice period/)
  assert.equal(last.continues, null,
    'a question asked after a long silence was merged into the previous one')
})

/* E — the chain is bounded, so a monologue cannot regrow the prompt forever. */
check('the merge chain is bounded by maxContinuations', () => {
  const events = [{ at: 0, speechStart: true }]
  for (let i = 0; i < 60; i++) {
    events.push({ at: 100 + i * 300, speechStart: true })
    events.push({
      at: 200 + i * 300, text: 'and then we rebuilt the indexing layer around it and',
      speechStartedAt: 100 + i * 300, speechEndedAt: 150 + i * 300, speechMs: 50,
    })
  }
  const out = run(events)
  assert.ok(out.length >= 2, 'this fixture must produce several emits')
  for (const u of out) {
    assert.ok(u.chainSeq <= SEGMENT_DEFAULTS.maxContinuations,
      `chainSeq ${u.chainSeq} exceeds maxContinuations`)
  }
})

/* F — the speech-span cap is what bounds a talker who never pauses, now that
      maxHoldMs no longer reaches that case. */
check('maxUtteranceSpeechMs bounds a continuous talker', () => {
  const events = [{ at: 0, speechStart: true }]
  for (let i = 1; i <= 10; i++) {
    events.push({ at: i * 12000, speechEnd: true, endReason: 'max-segment' })
    events.push({
      at: i * 12000 + 500, text: `and then we rebuilt the whole indexing layer part ${i} and`,
      speechStartedAt: (i - 1) * 12000, speechEndedAt: i * 12000, speechMs: 12000,
    })
    events.push({ at: i * 12000 + 100, speechStart: true })
  }
  const out = run(events)
  assert.ok(out.length >= 1, 'a continuous talker must still emit')
  for (const u of out) {
    const span = u.speechEndedAt - u.speechStartedAt
    assert.ok(span <= SEGMENT_DEFAULTS.maxUtteranceSpeechMs + 12000,
      `utterance span ${span}ms is unbounded`)
  }
})

/* G — labelling. A COMPLETE question that merely ARRIVED late is a finished
      question, not a truncation, and must not invite a merge. */
check('a slow-arriving COMPLETE question is labelled complete, not capped', () => {
  const out = run([
    { at: 0, speechStart: true },
    { at: 12000, speechEnd: true },
    // 16s after speech started — over the OLD cap, well under the new one.
    { at: 16000, text: 'What is the difference between a class and a struct?',
      speechStartedAt: 0, speechEndedAt: 12000, speechMs: 12000 },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].reason, 'complete', `emitted as ${out[0].reason}`)
  assert.equal(out[0].final, true)
  assert.equal(out[0].continues, null)
})

/* SELF-VOICE 2026-08-31 ─ the candidate's own voice, and its echo guard ───────
   The capture itself needs a microphone and cannot be driven here. What CAN be
   driven — and is where the risk actually is — is the aggregator hook the
   harvest hangs off, and the text-overlap backstop that decides whether a line
   was the candidate speaking or the interviewer coming back through speakers. */

/* H — the new onSpeechStart option must be inert to segmentation. This is the
      whole safety argument for adding a callback to the aggregator at all. */
check('onSpeechStart fires without changing a single emit', () => {
  const events = [
    ...burst({ text: 'So what is',                     from: 0,    to: 900,  transcriptAt: 2250 }),
    ...burst({ text: 'tell me about class in C sharp', from: 2000, to: 3600, transcriptAt: 5000 }),
  ]
  const withoutHook = run(events)

  const seen = []
  const clock = makeClock()
  const emitted = []
  const agg = createUtteranceAggregator({
    emit: (u) => emitted.push(u),
    onSpeechStart: (at) => seen.push(at),
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  })
  const ordered = [...events].sort((a, b) => a.at - b.at)
  for (const e of ordered) {
    clock.advanceTo(e.at)
    if (e.speechStart) agg.noteSpeechStart(e.at)
    else if (e.speechEnd) agg.noteSpeechEnd(e.at, e.endReason || 'silence')
    else agg.pushFragment(e.text, e)
  }
  clock.advanceTo(ordered[ordered.length - 1].at + 60000)

  assert.ok(seen.length >= 2, 'onSpeechStart never fired')
  assert.equal(emitted.length, withoutHook.length)
  assert.deepEqual(emitted.map((u) => u.text), withoutHook.map((u) => u.text))
  assert.deepEqual(emitted.map((u) => u.heldMs), withoutHook.map((u) => u.heldMs))
})

/* I — echo. The same sentence arriving on both streams must be dropped, and two
      different sentences about the same topic must NOT be. */
check('speaker dedupe drops an echo and keeps a genuine answer', () => {
  const heard = ['What is a closure in JavaScript, and when would you use one?']

  // Transcribed from the speakers by the candidate's own mic — same words,
  // different casing and a dropped tail, exactly as a second transcription
  // of the same audio comes out.
  assert.equal(isEcho('what is a closure in javascript and when would you use one', heard), true)
  assert.equal(isEcho('What is a closure in JavaScript, and when would you', heard), true)

  // The candidate actually answering. Same topic, different words — must survive.
  assert.equal(
    isEcho('A closure is a function that captures the scope it was defined in.', heard), false)
  assert.equal(isEcho('I used one for the debounce helper in our search box.', heard), false)

  // Nothing to compare against is not a reason to drop anything.
  assert.equal(isEcho('A closure is a function that captures its scope.', []), false)
})

/* J — the short-line floor. Below it the ratio is meaningless, and a false
      positive there would silently swallow real context. */
check('speaker dedupe does not fire on text too short to judge', () => {
  assert.equal(isEcho('ok', ['ok then']), false)
  assert.equal(isEcho('yes', ['yes, exactly right']), false)
})

/* PREMIUM-UX 2026-08-31 ─ the markdown parser, and the half-streamed cases ────
   The reason this parser exists at all is that the answer arrives one token at a
   time, so almost every intermediate state is invalid markdown. What must never
   happen is the answer visibly REWRITING itself as the closing markers land —
   asterisks appearing and then vanishing, three backticks becoming a code block.
   These fixtures are that guarantee. */

check('markdown: blocks parse to the right kinds', () => {
  const blocks = parseBlocks(
    '# Heading\nplain line\n- first\n- second\n1. step one\n> quoted\n---'
  )
  assert.deepEqual(blocks.map((b) => b.type),
    ['h', 'p', 'li', 'li', 'oli', 'quote', 'hr'])
  assert.equal(blocks[0].text, 'Heading')
  assert.equal(blocks[4].n, '1')
})

check('markdown: an UNTERMINATED fence is a code block immediately', () => {
  // Mid-stream: the closing ``` has not arrived. Rendering three literal
  // backticks here and a block a second later is the reflow this prevents.
  const blocks = parseBlocks('Here you go:\n```\nconst x = 1\nconst y = 2')
  assert.equal(blocks[blocks.length - 1].type, 'pre')
  assert.equal(blocks[blocks.length - 1].text, 'const x = 1\nconst y = 2')

  // And the finished version parses to the same block.
  const done = parseBlocks('Here you go:\n```\nconst x = 1\nconst y = 2\n```')
  assert.equal(done[done.length - 1].type, 'pre')
  assert.equal(done[done.length - 1].text, 'const x = 1\nconst y = 2')
})

check('markdown: a trailing unmatched marker is hidden, never printed', () => {
  // The exact frame where "**Time complexity" has streamed but "**" has not.
  const half = splitInline('The answer is **Time complexity')
  assert.ok(!half.some((p) => p.text.includes('*')), `asterisk leaked: ${JSON.stringify(half)}`)
  assert.deepEqual(half, [
    { type: 'text', text: 'The answer is ' },
    { type: 'strong', text: 'Time complexity' },
  ])

  // Same for an open backtick.
  assert.deepEqual(splitInline('use `useMemo'), [
    { type: 'text', text: 'use ' },
    { type: 'code', text: 'useMemo' },
  ])

  // A lone marker with nothing after it yet emits nothing at all, rather than
  // a stray asterisk that disappears one token later.
  assert.deepEqual(splitInline('the answer is **'), [{ type: 'text', text: 'the answer is ' }])
})

check('markdown: inline runs resolve in the right order', () => {
  assert.deepEqual(splitInline('a **b** c `d` e'), [
    { type: 'text', text: 'a ' },
    { type: 'strong', text: 'b' },
    { type: 'text', text: ' c ' },
    { type: 'code', text: 'd' },
    { type: 'text', text: ' e' },
  ])

  // ** inside backticks is code, not emphasis — which is why `code` is checked
  // first in INLINE_RULES.
  assert.deepEqual(splitInline('call `a ** b` now'), [
    { type: 'text', text: 'call ' },
    { type: 'code', text: 'a ** b' },
    { type: 'text', text: ' now' },
  ])

  // Plain text with no markers is one node, not a pile of empty ones.
  assert.deepEqual(splitInline('nothing to mark up here'),
    [{ type: 'text', text: 'nothing to mark up here' }])
})

check('markdown: growing text never loses what it already showed', () => {
  /* The strongest property, asserted by construction: feed the answer one
     character at a time and the visible text must only ever grow. If any
     intermediate frame printed a marker that a later frame removed, the plain
     text would shrink here. */
  const full = 'Use **memoisation**. See `useMemo`:\n\n- it caches\n- it is cheap'
  let previous = ''
  for (let i = 1; i <= full.length; i++) {
    const visible = parseBlocks(full.slice(0, i))
      .flatMap((b) => (b.type === 'pre' ? [b.text] : splitInline(b.text).map((p) => p.text)))
      .join('')
    // Growth is monotonic in LENGTH; a marker being hidden then shown would dip.
    assert.ok(visible.length >= previous.length - 1,
      `visible text shrank at ${i}: "${previous}" -> "${visible}"`)
    previous = visible
  }
  assert.ok(previous.includes('memoisation'))
  assert.ok(previous.includes('useMemo'))
  assert.ok(!previous.includes('*'), `a marker survived into the output: "${previous}"`)
})

/* EMPHASIS 2026-09-01 ─ ==highlight==, and the operator it must not eat ───────
   The whole risk of this marker is in the second fixture. A candidate is asked
   about equality checks constantly, so "==" appears in ordinary prose in this
   product far more often than it does anywhere else — and the obvious regex,
   /==([^=]+)==/, highlights the text between two unrelated comparisons. */

check('markdown: ==highlight== marks a span', () => {
  assert.deepEqual(splitInline('Answer: ==O(n) time== overall'), [
    { type: 'text', text: 'Answer: ' },
    { type: 'mark', text: 'O(n) time' },
    { type: 'text', text: ' overall' },
  ])

  // Bold and highlight are separate levels and must not consume each other.
  assert.deepEqual(splitInline('**hash map**, ==O(n)=='), [
    { type: 'strong', text: 'hash map' },
    { type: 'text', text: ', ' },
    { type: 'mark', text: 'O(n)' },
  ])
})

check('markdown: == as a comparison operator is never a highlight', () => {
  // Two operators on one line: the naive rule marks " b and c ".
  assert.deepEqual(splitInline('if a == b and c == d'),
    [{ type: 'text', text: 'if a == b and c == d' }])

  // The sentence this product will actually produce.
  assert.deepEqual(splitInline('use === not ==, because == coerces'),
    [{ type: 'text', text: 'use === not ==, because == coerces' }])

  // Inside backticks nothing applies at all — `code` is checked first.
  assert.deepEqual(splitInline('write `a == b` here'), [
    { type: 'text', text: 'write ' },
    { type: 'code', text: 'a == b' },
    { type: 'text', text: ' here' },
  ])

  // Two real highlights on one line resolve as two, not as one span swallowing
  // the text between them — this is what the lazy quantifier buys.
  assert.deepEqual(splitInline('==first== then ==second=='), [
    { type: 'mark', text: 'first' },
    { type: 'text', text: ' then ' },
    { type: 'mark', text: 'second' },
  ])
})

check('markdown: a half-arrived == never prints', () => {
  // The frame where the closing pair is one character short.
  assert.deepEqual(splitInline('Answer: ==O(n) time='), [
    { type: 'text', text: 'Answer: ' },
    { type: 'mark', text: 'O(n) time' },
  ])

  // And the frame before any content has arrived after the opener.
  assert.deepEqual(splitInline('Answer: =='), [{ type: 'text', text: 'Answer: ' }])

  // The monotonic-growth property, for a line carrying a highlight.
  const full = 'Say ==O(n log n)== and **stop**'
  let previous = ''
  for (let i = 1; i <= full.length; i++) {
    const visible = splitInline(full.slice(0, i)).map((p) => p.text).join('')
    assert.ok(visible.length >= previous.length - 1,
      `visible text shrank at ${i}: "${previous}" -> "${visible}"`)
    previous = visible
  }
  assert.ok(!previous.includes('='), `a marker survived into the output: "${previous}"`)
  assert.ok(!previous.includes('*'), `a marker survived into the output: "${previous}"`)
})

console.log(failures === 0 ? '\nall green\n' : `\n${failures} failing\n`)
process.exit(failures === 0 ? 0 : 1)
