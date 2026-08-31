'use client'

import { useEffect, useRef, useState } from 'react'
import Icon from 'smarthire-ui/Icon'

/**
 * The product frame in the hero, running as a loop.
 *
 * REDESIGN 2026-08-30: ported from the reference design's animated overlay.
 *
 * CONCEPT 2026-08-30 (later): the frame is the product in one picture, and the
 * product is the other way round again. Left pane is the question the
 * INTERVIEWER asked; right pane is the answer, streamed while they are still
 * finishing the sentence. That is the whole pitch of the site, so this file is
 * the one place it has to be unmistakable.
 *
 * What the panes are NOT. The right pane is written to the person reading it —
 * points they can say in their own words — not a script in their voice. Nothing
 * here is phrased as “say this”, and nothing on the frame claims the interviewer
 * cannot see it. Both of those are the pre-pivot product, and the prompt still
 * refuses them: see the header of apps/desktop/src/services/systemPrompt.js.
 *
 * Nothing in this file is a claim about latency. The reference showed a "4.0s"
 * counter; there is no measured figure for this app, so the timer bar is a
 * progress indicator with no number attached to it.
 */

/*
  The interviewer-side loop this replaced, kept per the convention in this repo.
  It cycled what the candidate said and the follow-ups to ask back.

  const SESSION = [
    {
      tag: 'Interview · Systems',
      short: 'Systems',
      said:
        '“We moved the whole billing system over to event sourcing. It was a big lift ' +
        'but it went pretty smoothly, and performance improved a lot.”',
      asks: [
        { text: '“Improved a lot” is doing the work here. Ask what the p99 was before and after, and who measured it.' },
        { text: 'Their CV puts them on the payments team for four months of that migration', source: 'resume', tail: '— worth asking which parts they owned.' },
        { text: 'Ask what broke. “Smoothly” across a billing migration is rare.' },
      ],
    },
    {
      tag: 'Interview · Ownership',
      short: 'Ownership',
      said:
        '“We cut our infra spend by about 40% last year. I drove most of that work ' +
        'with the platform team.”',
      asks: [
        { text: '40% of what base? Ask for the starting figure — the percentage is meaningless without it.' },
        { text: '“Drove most of it” with another team. Ask what they decided versus what they executed.' },
        { text: 'Ask what got worse. Cost work usually trades against latency or headroom somewhere.' },
      ],
    },
    {
      tag: 'Interview · Debugging',
      short: 'Debugging',
      said:
        '“There was a memory leak in production for a few weeks. I eventually tracked ' +
        'it down and patched it.”',
      asks: [
        { text: 'Ask how they confirmed it was a leak and not high steady-state usage. The method matters more than the fix.' },
        { text: '“Eventually” covers a lot of ground. Ask what they tried first that did not work.' },
        { text: 'Ask what stopped it recurring — a test, an alert, or nothing.' },
      ],
    },
    {
      tag: 'Interview · Role fit',
      short: 'Role fit',
      said:
        '“I have done a fair amount of on-call, and I am comfortable owning a service ' +
        'end to end.”',
      asks: [
        { text: 'The role is 1-in-4 on-call for a payments service', source: 'JD', tail: '— ask what their rotation looked like and how often they were paged.' },
        { text: 'Ask for the last incident they led, and what the follow-up actions were.' },
        { text: '“End to end” — ask whether that included the on-call budget and the deprecation.' },
      ],
    },
  ]
*/
const SESSION = [
  {
    tag: 'Interview · Systems',
    short: 'Systems',
    said:
      '“Tell me about a system you took from design to production. What was hard ' +
      'about it, and what did you actually own?”',
    asks: [
      { text: 'The billing migration to event sourcing — four months on the payments team', source: 'resume', tail: ', and you owned the replay path.' },
      { text: 'Lead with the outcome: p99 down from 900ms to 210ms, and the cutover ran with no downtime.' },
      { text: 'The hard part was idempotency on replay. Say that plainly — it is the part they are asking about.' },
    ],
  },
  {
    tag: 'Interview · Ownership',
    short: 'Ownership',
    said:
      '“Give me an example of a time you disagreed with a technical decision your ' +
      'team had already made.”',
    asks: [
      { text: 'Use the Redis-to-Postgres queue call. You argued against it, then wrote the load test that settled it.' },
      { text: 'Say what changed your mind: the numbers came back against your own position and you shipped their design.' },
      { text: 'Finish with the outcome, not the argument. That is what the question is really for.' },
    ],
  },
  {
    tag: 'Interview · Technical',
    short: 'Technical',
    said:
      '“How would you keep a payments API idempotent when the client retries after ' +
      'a timeout?”',
    asks: [
      { text: 'Client sends an idempotency key; you store it with the result and return the stored response on a repeat.' },
      { text: 'Key on a unique index in the same transaction as the write, so two concurrent retries cannot both proceed.' },
      { text: 'Expire the keys — 24 hours is the usual choice — and say why: the table grows forever otherwise.' },
    ],
  },
  {
    tag: 'Interview · Role fit',
    short: 'Role fit',
    said:
      '“This role is 1-in-4 on-call for a payments service. How much on-call have ' +
      'you carried, and how did you find it?”',
    asks: [
      { text: 'The JD says 1-in-4 for payments', source: 'JD', tail: ' — your rotation was 1-in-6 on the same kind of service.' },
      { text: 'Name the last incident you led and the follow-up you shipped after it. Specifics beat “comfortable with on-call”.' },
      { text: 'Be straight about the load: you have done it, not at this frequency. They can work with that.' },
    ],
  },
]

const STATUS = {
  listen: { label: 'Listening',        dot: 'bg-positive' },
  think:  { label: 'Reading your CV',  dot: 'bg-faint'    },
  write:  { label: 'Writing',          dot: 'bg-ink'      },
  // ready: { label: 'Ready to ask',    dot: 'bg-positive' },
  ready:  { label: 'Ready to answer',  dot: 'bg-positive' },
}

// const TYPE_MS = 17       // per character, for the candidate's line
const TYPE_MS = 17          // per character, for the interviewer's question
const STREAM_MS = 2600      // whole answer block
const HOLD_MS = 4200        // time to read before the next entry

export default function LiveDemo() {
  const [entry, setEntry] = useState(0)
  const [typed, setTyped] = useState('')
  const [words, setWords] = useState(0)      // answer words revealed so far
  const [status, setStatus] = useState('listen')
  const [dim, setDim] = useState(false)
  const [bar, setBar] = useState(0)
  const [clock, setClock] = useState('12:04')
  const [live, setLive] = useState(false)    // has the loop started

  const hostRef = useRef(null)

  // ── start only once the frame is actually on screen ──────────────────────
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      setLive(true)
      io.disconnect()
    }, { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // ── the session clock ────────────────────────────────────────────────────
  // Starts from the same 12:04 the server rendered, so the first paint matches
  // the markup and there is no hydration mismatch.
  useEffect(() => {
    if (!live) return
    let secs = 12 * 60 + 4
    const id = setInterval(() => {
      secs += 1
      const m = String(Math.floor(secs / 60)).padStart(2, '0')
      const s = String(secs % 60).padStart(2, '0')
      setClock(`${m}:${s}`)
    }, 1000)
    return () => clearInterval(id)
  }, [live])

  // ── the loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!live) return

    // The global prefers-reduced-motion rule in globals.css zeroes CSS
    // animation, but it cannot reach a JS timer loop. Guard it here: settle on
    // the first entry, fully rendered, and never cycle.
    const reduce =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduce) {
      setTyped(SESSION[0].said)
      setWords(Number.MAX_SAFE_INTEGER)
      setStatus('ready')
      setBar(100)
      return
    }

    let cancelled = false
    let raf = 0
    const timers = new Set()

    // A sleep that resolves early if the effect is torn down, so a StrictMode
    // remount or a route change does not leave a chain of timers running
    // against unmounted state.
    const wait = (ms) => new Promise(resolve => {
      const id = setTimeout(() => { timers.delete(id); resolve() }, ms)
      timers.add(id)
    })

    const typeLine = async (text) => {
      for (let i = 0; i <= text.length; i++) {
        if (cancelled) return
        setTyped(text.slice(0, i))
        await wait(TYPE_MS)
      }
    }

    const streamAsks = (total) => new Promise(resolve => {
      const start = performance.now()
      const step = (now) => {
        if (cancelled) return resolve()
        const p = Math.min((now - start) / STREAM_MS, 1)
        setWords(Math.ceil(p * total))
        setBar(p * 100)
        if (p < 1) { raf = requestAnimationFrame(step) } else resolve()
      }
      raf = requestAnimationFrame(step)
    })

    ;(async () => {
      let i = 0
      while (!cancelled) {
        const d = SESSION[i % SESSION.length]
        const total = d.asks.reduce((n, a) => n + countWords(a), 0)

        setEntry(i % SESSION.length)
        setDim(false)
        setTyped(''); setWords(0); setBar(0)
        setStatus('listen')

        await wait(650);            if (cancelled) return
        await typeLine(d.said);     if (cancelled) return
        setStatus('think')
        await wait(340);            if (cancelled) return
        setStatus('write')
        await streamAsks(total);    if (cancelled) return
        setStatus('ready')
        await wait(HOLD_MS);        if (cancelled) return

        setDim(true)
        await wait(480)
        i += 1
      }
    })()

    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
    }
  }, [live])

  const d = SESSION[entry]
  const st = STATUS[status]

  return (
    <div ref={hostRef} className="relative">
      {/* Soft ground behind the frame, as in the reference. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-12 -inset-y-10 -z-10"
        style={{
          background:
            'radial-gradient(ellipse at 62% 28%, color-mix(in srgb, var(--color-ink) 7%, transparent), transparent 66%)',
        }}
      />

      <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_60px_-24px_rgba(0,0,0,0.18)]">
        {/* ── status bar ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-3.5 border-b border-line bg-canvas-2 px-4 py-3">
          <span className="flex shrink-0 gap-1.5">
            {[0, 1, 2].map(i => (
              <span key={i} className="h-2.5 w-2.5 rounded-full bg-line" />
            ))}
          </span>

          <span className="mono flex items-center gap-2 whitespace-nowrap text-[11px] text-faint">
            <span
              className={`h-[7px] w-[7px] shrink-0 rounded-full ${st.dot} ${status === 'ready' ? '' : 'pulse'}`}
            />
            {st.label}
          </span>

          <span className="wave hidden h-4 items-end gap-[3px] sm:flex" aria-hidden="true">
            {[0, 0.12, 0.24, 0.36, 0.48, 0.18, 0.3].map((delay, i) => (
              <i key={i} style={{ animationDelay: `${delay}s` }} />
            ))}
          </span>

          {/* The topic sits here rather than in the left pane's header. That
              pane is the narrow half of the split, and an uppercase tracked
              "INTERVIEWER ASKED" plus a tag beside it wrapped onto two lines. */}
          <span className="mono ml-auto flex items-center gap-3 text-[11px] text-faint">
            <span className="hidden uppercase tracking-[0.1em] sm:inline">{d.short}</span>
            <span>{clock}</span>
          </span>
        </div>

        {/* ── panes ────────────────────────────────────────────────────── */}
        <div
          className={`grid gap-px bg-line transition-opacity duration-500 sm:grid-cols-[1fr_1.4fr] ${dim ? 'opacity-0' : 'opacity-100'}`}
        >
          <div className="bg-paper p-5">
            {/* <p className="eyebrow mb-3 whitespace-nowrap">Candidate said</p> */}
            <p className="eyebrow mb-3 whitespace-nowrap">Interviewer asked</p>
            <p className="min-h-[7.5em] text-[14px] leading-relaxed text-ink sm:min-h-[9em]">
              {typed}
              {status === 'listen' && typed.length > 0 && <i className="caret" />}
            </p>
          </div>

          <div className="bg-paper p-5">
            {/* <p className="eyebrow mb-3">Ask next</p> */}
            <p className="eyebrow mb-3">Your answer</p>
            <ul className="min-h-[7.5em] space-y-3 text-[14px] leading-relaxed text-ink-soft sm:min-h-[9em]">
              {renderAsks(d.asks, words, status)}
            </ul>
          </div>
        </div>

        {/* ── progress + footer ────────────────────────────────────────── */}
        <div className="h-[3px] bg-canvas-2">
          <div className="h-full bg-ink" style={{ width: `${bar}%` }} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas-2 px-4 py-3">
          {/* <span className="mono text-[11px] text-faint">Suggestions stream as they are written</span> */}
          <span className="mono text-[11px] text-faint">
            Answers stream as they are written
          </span>
          {/* The mark on the right is the one claim the frame makes about itself,
              so it is the grounding rule from answerPrompt()'s ACCURACY block —
              cite the document, never invent — and not a promise about who can
              see the window. The site is silent on that on purpose.

              <span …><Icon name="shield" /> CV used with consent</span> */}
          <span className="mono flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-positive">
            <Icon name="file" size={13} />
            Drawn from your CV
          </span>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────── helpers */

/** Total words in one answer point, counting the tail that follows a source tag. */
function countWords(ask) {
  return (
    ask.text.split(' ').length +
    (ask.source ? 1 : 0) +
    (ask.tail ? ask.tail.split(' ').length : 0)
  )
}

/**
 * Reveals the answer against a running word budget, so the three points cascade
 * rather than appearing at once. An item with no budget left is not rendered at
 * all — an empty <li> would still draw its bullet.
 */
function renderAsks(asks, budget, status) {
  let used = 0

  return asks.map((ask, i) => {
    const words = ask.text.split(' ')
    const tailWords = ask.tail ? ask.tail.split(' ') : []
    const available = Math.max(0, budget - used)
    used += countWords(ask)

    if (available <= 0) return null

    const shownText = words.slice(0, available).join(' ')
    const afterText = Math.max(0, available - words.length)
    const showSource = ask.source && afterText > 0
    const shownTail = tailWords.slice(0, Math.max(0, afterText - 1)).join(' ')

    // The caret sits on whichever item is still being written.
    const writing = status === 'write' && available < countWords(ask)

    return (
      <li key={i} className="flex gap-2.5">
        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink" />
        <span>
          {shownText}
          {showSource && (
            <span className="mono ml-1 rounded bg-canvas-2 px-1 py-px text-[11px] text-muted">
              [{ask.source}]
            </span>
          )}
          {shownTail && ` ${shownTail}`}
          {writing && <i className="caret" />}
        </span>
      </li>
    )
  })
}
