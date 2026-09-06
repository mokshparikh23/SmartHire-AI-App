/*
  SCREEN-ANSWERS 2026-09-06 ─ measure a model before pinning it.

  WHY THIS EXISTS. lib/ai.js pins two models per provider and the comments around
  them carry MEASURED numbers, not opinions — the Gemini table records that
  gemini-3.7-flash was rejected for smartModel on time-to-first-token, and
  GEMINI_REASONING_EFFORT records ~14s at the default against ~4s at 'low'. Those
  numbers were taken by hand and the method was not written down, so the next
  person had to invent it again. This is the method.

  WHAT IT MEASURES AND WHY THAT ONE NUMBER. Time to the FIRST CONTENT DELTA, not
  total completion time. The desktop streams into the answer card, so the candidate
  starts reading at the first token; total length is paid for while they read.
  STALL_TIMEOUT_MS in services/aiBackend.js is 12000, and a model that occasionally
  exceeds it does not arrive slowly — it arrives as an ABORTED answer. That is the
  number that decides whether a model is usable in a live interview.

  It sends the real system prompt, so the measurement includes the prompt's own
  size. That matters: this was written the same day the prompt grew ~1370 tokens.

  USAGE (needs OPENAI_API_KEY in apps/dashboard/.env.local):
    node scripts/probe-model-latency.mjs
    node scripts/probe-model-latency.mjs gpt-4o gpt-4.1 --runs 5

  It makes real, billed API calls — a handful of cheap completions per run. It
  never prints the key.
*/
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/* The repo has no dotenv on the server side — the routes read process.env, which
   Vercel populates. A five-line parser beats adding a dependency to a script. */
function envFrom(file) {
  try {
    return Object.fromEntries(readFileSync(join(ROOT, file), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      }))
  } catch { return {} }
}

const env = { ...envFrom('apps/dashboard/.env.local'), ...envFrom('.env.local'), ...process.env }
const KEY = env.OPENAI_API_KEY
if (!KEY) {
  console.error('No OPENAI_API_KEY found in apps/dashboard/.env.local, .env.local or the environment.')
  process.exit(1)
}

const args   = process.argv.slice(2)
const runsAt = args.indexOf('--runs')
const RUNS   = runsAt === -1 ? 3 : Number(args[runsAt + 1])
const MODELS = args.filter((a, i) => !a.startsWith('--') && i !== runsAt + 1)
const TARGETS = MODELS.length ? MODELS : ['gpt-4o', 'gpt-4.1']

/* The real prompt, so the measurement includes its size. Imported through
   vite-node when available; otherwise the probe still runs against a stand-in and
   says so, because a number taken against the wrong prompt is worse than none. */
let system
try {
  globalThis.localStorage ||= (() => {
    const mem = new Map()
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => void mem.set(k, String(v)),
      removeItem: (k) => void mem.delete(k),
      clear: () => mem.clear(),
    }
  })()
  ;({ buildSystemPrompt: system } = await import(
    join(ROOT, 'apps/desktop/src/services/systemPrompt.js')))
  system = system()
} catch {
  console.warn('! could not import the real system prompt (run through vite-node for that);')
  console.warn('! measuring against a short stand-in, so these numbers are NOT comparable')
  console.warn('! to any taken with the real prompt.\n')
  system = 'You are a live assistant for the person being interviewed.'
}

/* A coding question, because that is the request this change is for and the one
   most likely to make a model think before it speaks. */
const QUESTION = '[SCREENSHOT] Answer the question that is on this screen. '
  + 'Read it, work out what it is asking, and give the answer itself — not a '
  + 'description of what is on the screen.\n\n'
  + 'Given an array of integers and a target, return the indices of the two '
  + 'numbers that add up to the target. Each input has exactly one solution.'

async function once(model) {
  const started = Date.now()
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 6144,          // MAX_TOKENS_SMART — the budget this intent gets
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: QUESTION },
      ],
    }),
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let ttft = null
  let chars = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      let delta
      try { delta = JSON.parse(data)?.choices?.[0]?.delta?.content } catch { continue }
      if (!delta) continue
      // The first CONTENT delta. Role-only deltas arrive first and are not what
      // the candidate sees.
      if (ttft === null) ttft = Date.now() - started
      chars += delta.length
    }
  }
  return { ttft: ttft ?? Date.now() - started, total: Date.now() - started, chars }
}

const stat = (xs) => ({
  min: Math.min(...xs),
  max: Math.max(...xs),
  median: [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)],
})

console.log(`system prompt: ${system.length} chars (~${Math.round(system.length / 4)} tokens)`)
console.log(`${RUNS} runs per model, measuring time to first CONTENT delta`)
console.log(`STALL_TIMEOUT_MS is 12000 — a model that flirts with it is not usable live\n`)

for (const model of TARGETS) {
  const ttfts = []
  const totals = []
  process.stdout.write(`${model.padEnd(12)} `)
  for (let i = 0; i < RUNS; i++) {
    try {
      const r = await once(model)
      ttfts.push(r.ttft)
      totals.push(r.total)
      process.stdout.write(`${(r.ttft / 1000).toFixed(2)}s `)
    } catch (e) {
      process.stdout.write(`FAIL(${e.message.slice(0, 60)}) `)
    }
  }
  if (ttfts.length) {
    const t = stat(ttfts)
    const c = stat(totals)
    console.log(`\n  ttft  median ${(t.median / 1000).toFixed(2)}s  `
      + `min ${(t.min / 1000).toFixed(2)}s  max ${(t.max / 1000).toFixed(2)}s`)
    console.log(`  total median ${(c.median / 1000).toFixed(2)}s\n`)
  } else {
    console.log('\n  no successful runs\n')
  }
}
