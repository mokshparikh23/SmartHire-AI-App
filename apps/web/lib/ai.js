import { validateLicense } from './license'
import { createAdminClient } from './supabase-server'
// import { heartbeatSession, chargeMinutes, isUnlimited, RESEARCH_COST_MINUTES } from './metering'
import {
  heartbeatSession, chargeMinutes, isUnlimited,
  RESEARCH_COST_MINUTES, RESUME_PARSE_COST_MINUTES,
} from './metering'

export const OPENAI_BASE = 'https://api.openai.com/v1'

/* GEMINI-FALLBACK 2026-08-30 ──────────────────────────────────────────────────
   Two providers, chosen by which key is present.

   Gemini is reached through its OpenAI-compatible surface
   (https://ai.google.dev/gemini-api/docs/openai), which speaks the same
   /chat/completions shape including `stream: true` and `image_url` content
   parts. That matters more than it looks: /api/ai/chat is a raw SSE passthrough
   and the desktop parses OpenAI's `choices[].delta.content` frames directly, so
   swapping the base URL and the key is genuinely the whole change for answers,
   chat and screenshots.

   TRANSCRIPTION IS THE EXCEPTION and is handled separately in
   /api/ai/transcribe. The compatibility layer has no /audio/transcriptions
   endpoint at all, and its `input_audio` content part documents only wav —
   while useVoice records audio/webm;codecs=opus. So Gemini transcription goes
   through the native /v1beta/interactions surface, which takes webm inline. */

export const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/openai'
export const GEMINI_NATIVE_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * Model lists are per provider, and both are allowlists for the same reason:
 * callers pick the model, so without this an extracted licence key could bill us
 * for the most expensive model available.
 */
export const PROVIDERS = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    base: OPENAI_BASE,
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o',       label: 'GPT-4o',       desc: 'Best quality', badge: 'Recommended' },
      { id: 'gpt-4o-mini',  label: 'GPT-4o mini',  desc: 'Fastest',      badge: 'Fast' },
      { id: 'gpt-4.1',      label: 'GPT-4.1',      desc: 'Balanced',     badge: '' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', desc: 'Lightweight',  badge: '' },
    ],
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    base: GEMINI_BASE,
    envKey: 'GEMINI_API_KEY',
    /* MEASURED 2026-08-30, same prompt, three runs each, effort=low:
         3.7-flash       timeout(12s) | 7.8s | 8.5s
         3.6-flash              2.3s  | 3.2s | 3.6s
         3.5-flash             10.0s  | 6.6s | 8.7s
         3.5-flash-lite         0.94s | 0.94s| 1.03s

       The default was 3.7-flash and that is what "generating……" was: eight
       seconds of thinking, sometimes a timeout, for a suggestion the interviewer
       has about three seconds to read. Lite is not a compromise here — asked to
       follow up on "we rebuilt it and it improved a lot" it still pinned the
       vague claim, split the candidate's work from the team's, and asked for the
       metric. Bigger models phrase it better; nobody can read a phrasing that
       arrives after the moment has passed. */
    // defaultModel: 'gemini-3.7-flash',
    defaultModel: 'gemini-3.5-flash-lite',
    // VERIFIED 2026-08-30 against the compatibility endpoint, one request each.
    // gemini-2.5-flash and gemini-2.5-pro were in this list and BOTH 404 there —
    // they appear in GET /v1beta/models, so they exist, but the OpenAI-compatible
    // surface does not serve them. Listing a model the picker cannot actually
    // use is worse than a short list, so anything here has been called once and
    // answered 200. Re-check with that same probe before adding to it.
    // Ordered by measured latency, fastest first, because that is the axis that
    // decides whether a suggestion is usable mid-interview. The descriptions
    // quote real numbers rather than adjectives so the choice is informed.
    models: [
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Lite',  desc: '~1s · best for live use', badge: 'Recommended' },
      { id: 'gemini-3.6-flash',      label: 'Gemini 3.6 Flash', desc: '~3s · more detail',       badge: '' },
      { id: 'gemini-3.5-flash',      label: 'Gemini 3.5 Flash', desc: '~8s',                     badge: '' },
      { id: 'gemini-3.7-flash',      label: 'Gemini 3.7 Flash', desc: '~8s · thinks the most',   badge: '' },
    ],
  },
}

/**
 * The provider we can actually reach, or null if neither key is configured.
 *
 * OpenAI wins when both are set — it is the intended provider and Gemini is the
 * stand-in until a key exists. The check is on TRUTHINESS, not presence, which
 * is the case that prompted this: .env.local carried a bare `OPENAI_API_KEY=`
 * with no value, and `if (!key)` in getOpenAIKey() turned that into a 500 on
 * every call rather than falling through to the provider that was configured.
 */
export function activeProvider() {
  if (process.env.OPENAI_API_KEY) return PROVIDERS.openai
  if (process.env.GEMINI_API_KEY) return PROVIDERS.gemini
  return null
}

/**
 * @returns {{provider: object, apiKey: string}}
 * @throws if neither key is set — the routes turn this into a 500 with the
 *         message below, which is what the operator needs to see.
 */
export function requireProvider() {
  const provider = activeProvider()
  if (!provider) {
    throw new Error(
      'No AI provider is configured on the server. Set OPENAI_API_KEY or GEMINI_API_KEY.'
    )
  }
  return { provider, apiKey: process.env[provider.envKey] }
}

// Moved to lib/http.js so the session routes can share them. Re-exported here so
// every existing `import { CORS, jsonError } from '@/lib/ai'` keeps working.
export { CORS, jsonError } from './http'

/**
 * Callers pick the model, so it has to be constrained: without this an
 * extracted licence key could bill us for the most expensive model available.
 */
// GEMINI-FALLBACK 2026-08-30: the allowlist is per provider now — see PROVIDERS
// above. Kept exported because /api/ai/research still pins its own model.
// const ALLOWED_MODELS = new Set(['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'])
export const DEFAULT_MODEL    = 'gpt-4o'
/* LATENCY 2026-08-30: whisper-1 -> gpt-4o-mini-transcribe.
   whisper-1 is the oldest speech model OpenAI still serves and the slowest of
   the three; this route fires on every pause in speech, so its round trip is
   most of the wait between someone finishing a question and the answer starting
   to stream. The newer model is built for exactly this shape of call.

   Safe for the request /api/ai/transcribe already makes: it sends
   response_format 'json' and a `language` hint, both of which this model
   supports. It does NOT support 'verbose_json' or the srt/vtt formats — if a
   caller is ever added that needs word timings, it needs whisper-1, not this. */
/* MULTILINGUAL 2026-08-30: the `language` half of that sentence is no longer
   true — the route sends `prompt` and NO language, deliberately. See
   TRANSCRIBE_PROMPT below and the note at the call site. The rest stands. */
// export const TRANSCRIBE_MODEL = 'whisper-1'
export const TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe'
/* LIVE CAPTION 2026-08-30: the model for the WebRTC realtime path, and it is
   deliberately NOT the same one.

   Measured on one 8-second utterance through the loopback tap:

     gpt-live-transcribe     deltas 8080ms -> 15719ms, ~one word every 200ms,
                             arriving WHILE the speaker was still talking.
     gpt-4o-mini-transcribe  speech_stopped at 15752ms, then every delta in a
                             single burst at 16108-16386ms.

   Both "stream". Only one of them streams during speech, and that is the entire
   feature. The cost of the difference is real — $0.017/min against $0.003/min —
   so the cheaper model stays on the HTTP path above, which is also the fallback.

   Trade-off that comes with it: gpt-live-transcribe returns 400 for
   turn_detection, so there is no server VAD and no .completed event. The desktop
   VAD closes turns. Supported values if this ever needs revisiting: whisper-1,
   gpt-realtime-whisper, gpt-live-transcribe, gpt-transcribe, gpt-4o-transcribe,
   gpt-4o-mini-transcribe. */
export const REALTIME_TRANSCRIBE_MODEL = 'gpt-live-transcribe'
// Gemini's own speech-to-text model. Only reached through the native surface;
// the OpenAI compatibility layer does not expose transcription at all.
export const GEMINI_TRANSCRIBE_MODEL = 'gemini-3.5-transcribe'

/* MULTILINGUAL 2026-08-30 ─────────────────────────────────────────────────────
   A vocabulary hint for the two OpenAI transcription paths — /audio/transcriptions
   in /api/ai/transcribe and, if the model accepts it, the realtime session in
   /api/ai/realtime.

   It is NOT a language setting and must never become one. `language` ASSERTS
   what the audio is; `prompt` only biases what words are expected, which is the
   half that helps a code-switched sentence ("C# me multiple inheritance ke baare
   me batao") without making the other four languages unreadable.

   DELIBERATELY ONE SHORT LINE. Whisper-family models transcribe the prompt back
   at you when the audio is near-silent — the same failure mode as the phantom
   "thank you" the desktop's filler list already suppresses — and the longer this
   string is, the more of it comes back as a question nobody asked. Anything
   added here costs that. */
export const TRANSCRIBE_PROMPT =
  'A technical job interview. English, Hindi, Gujarati or a mix, with English technical terms.'
/* THINKING 2026-08-30: raised from 1024, and it is not headroom for a longer
   answer — the reply is still capped at ~60 words by the prompt.

   On Gemini 3 models max_tokens is shared with THINKING tokens, and thinking is
   not optional (Google: for Gemini 3 and newer, reasoning "cannot be disabled
   entirely, only adjusted in intensity"). Measured on a plain follow-up prompt:
   34 completion tokens against 305 thought tokens. At 1024 the model could
   spend the whole budget reasoning and return an EMPTY string — observed
   repeatedly — which the overlay renders as the three dots that never resolve.
   That is the "generating……" that never finishes. */
// export const MAX_TOKENS = 1024
export const MAX_TOKENS = 4096

/* Thinking costs latency the interviewer pays for in the room. Measured
   time-to-first-token on gemini-3.7-flash: ~14s at the model default, ~4s at
   'low'. They have about three seconds to read a suggestion mid-conversation,
   so this is not a tuning preference — at the default the feature is unusable.
   'minimal' is rejected by 3.x with a 400, so 'low' is the floor. */
export const GEMINI_REASONING_EFFORT = 'low'

/**
 * Company research is a one-shot server-side call, so the caller does not get to
 * pick the model — it is pinned here rather than added to ALLOWED_MODELS. That
 * allowlist exists to cap what a leaked licence key can bill us for, and a
 * web-search call costs more per request than a chat completion.
 */
export const RESEARCH_MODEL = 'gpt-4.1'
export const RESEARCH_MAX_TOKENS = 900

/* RESUME-UPLOAD 2026-08-30 ──────────────────────────────────────────────────
   Résumé parsing. Pinned per provider for the same reason as RESEARCH_MODEL —
   this is a one-shot server-side call, so the caller does not get to choose and
   these stay out of ALLOWED_MODELS.

   The cheap tier on purpose. Pulling already-clean fields out of already-clean
   text is copying, not reasoning; research needs web search and judgement, this
   does not. 4o-mini also supports response_format json_schema with strict:true,
   which is what makes malformed JSON near-impossible rather than something to
   recover from. The Gemini id must come from provider.models above — an
   unverified name 404s on the compatibility surface. */
export const PARSE_MODEL = { openai: 'gpt-4o-mini', gemini: 'gemini-3.5-flash-lite' }

/* A SEPARATE budget from MAX_TOKENS even though the number matches today.
   MAX_TOKENS is the live-interview chat budget, tuned above against
   time-to-first-token in the room; coupling a batch extraction to it means the
   next latency tune silently starts truncating résumés. The THINKING note above
   is the constraint that matters here: on Gemini 3 this budget is shared with
   thinking tokens, and exhausting it returns an EMPTY string — so the route
   treats empty content as a failure branch rather than as "no data". */
export const PARSE_MAX_TOKENS = 4096

/* ~6k tokens of résumé. Typical résumés are 3–8k characters, so this rarely
   fires; truncateForParse() in lib/resume.js keeps the head AND the tail. */
export const MAX_PARSE_CHARS = 24000

/**
 * GEMINI-FALLBACK 2026-08-30: resolves against the ACTIVE provider's list.
 *
 * This is also the compatibility shim for stored settings. The desktop persists
 * the chosen model in localStorage, so an install that last ran on OpenAI has
 * 'gpt-4o' saved; on a Gemini server that name is unknown and falls back to the
 * Gemini default rather than being sent upstream and 400-ing.
 */
// export function resolveModel(model) {
//   return ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL
// }
export function resolveModel(model, provider = activeProvider()) {
  if (!provider) return DEFAULT_MODEL
  return provider.models.some((m) => m.id === model) ? model : provider.defaultModel
}

/**
 * Server-side only. This key must never be sent to the desktop app: anything
 * shipped to a client is extractable, which is the whole reason these routes
 * exist.
 */
export function getOpenAIKey() {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set on the server')
  return key
}

/**
 * @returns {{ok: true, license: object} | {ok: false, status: number, reason: string}}
 */
export async function requireLicense(licenseKey) {
  if (!licenseKey || typeof licenseKey !== 'string') {
    return { ok: false, status: 400, reason: 'licenseKey is required' }
  }

  let result
  try {
    result = await validateLicense(licenseKey)
  } catch (e) {
    return { ok: false, status: 503, reason: `Could not verify licence: ${e.message}` }
  }

  if (!result?.valid) {
    return { ok: false, status: 403, reason: result?.reason || 'Licence is not valid' }
  }

  return { ok: true, license: result }
}

/* PIPELINE 2026-08-31: how long the metering gate may hold a request before we
   call it stuck. It sits ahead of the provider call on every single answer, so
   this is time the user spends staring at three dots before generation has even
   started. A healthy heartbeat is one Supabase round trip; 4s is already far
   outside that, and the 503 it returns is retryable. */
const GATE_TIMEOUT_MS = 4000

/**
 * Gate for /api/ai/chat and /api/ai/transcribe.
 *
 * This does not merely CHECK the meter, it ADVANCES it: session_heartbeat bills
 * whatever server-clock time has passed, counts the request against the
 * per-session cap, and fails once the balance is gone — all before the upstream
 * call, so nobody at zero can extract one last free answer.
 *
 * That is deliberate, and it is what makes metering self-reinforcing: you cannot
 * use the AI without advancing the meter. The desktop's own heartbeat only
 * drives the countdown display; billing does not depend on it, which matters
 * because the renderer is unsigned JS a user can edit (asar: false in
 * electron-builder.config.cjs).
 *
 * AI calls cost TIME, not requests. Charging per request would make "1 credit =
 * 1 hour" untrue and would penalise the users getting the most out of an
 * interview, so nothing here debits per call. Subscribers are unmetered, and
 * their sessions pass through this same gate with metered=false on the row.
 *
 * @returns {{ok: true, session: object} | {ok: false, status: number, reason: string, code?: string}}
 */
export async function requireSession(licenseKey, sessionId) {
  if (!licenseKey || typeof licenseKey !== 'string') {
    return { ok: false, status: 400, reason: 'licenseKey is required' }
  }
  if (!sessionId || typeof sessionId !== 'string') {
    // 402, not 403: 403 means "your licence is bad" to the desktop app, and its
    // response to that is to sign the user out and delete their stored key.
    return {
      ok: false, status: 402, code: 'no_session',
      reason: 'Start a session before using the assistant.',
    }
  }

  let beat
  try {
    /* PIPELINE 2026-08-31 ─ the gate had no deadline, and it is a LOCK ─────────
       session_heartbeat takes SELECT … FOR UPDATE on the session row, reads the
       licence, updates ai_requests and calls session_settle — which on a metered
       account writes the wallet — all inside one transaction, and all before the
       provider is called. Every chat, voice and transcribe request for one
       session therefore serialises on that single row.

       So a slow request does not just delay itself: it directly lengthens the
       time-to-first-token of everything queued behind it, including
       transcription, which is the latency the segmentation layer is budgeting
       against. And with no deadline, a stuck lock hung the route until the
       platform killed the function at maxDuration.

       Bounded, NOT bypassed. The billing semantics documented above are
       deliberate and are not changed here: on timeout we return the same shape
       this function already returns for a database failure, so the client sees a
       retryable 503 instead of a hang. Shortening the lock itself — or splitting
       "check" from "advance" — is a billing change and needs its own pass. */
    // beat = await heartbeatSession({ sessionId, licenseKey, aiRequest: true })
    beat = await Promise.race([
      heartbeatSession({ sessionId, licenseKey, aiRequest: true }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('the meter did not respond in time')), GATE_TIMEOUT_MS)),
    ])
  } catch (e) {
    // A database failure is not a verdict. 503 tells the client to retry.
    return { ok: false, status: 503, code: 'meter_busy', reason: `Could not verify the session: ${e.message}` }
  }

  if (!beat?.ok) {
    return { ok: false, status: 403, code: beat?.code, reason: beat?.reason || 'Session is not valid' }
  }
  if (beat.stop) {
    return {
      ok: false, status: 402, code: beat.reason,
      reason: beat.reason === 'out_of_credits'
        ? 'You have run out of credits.'
        : beat.reason === 'request_limit'
          ? 'This session hit its request limit.'
          : 'This session has ended.',
    }
  }

  return { ok: true, session: beat }
}

/**
 * Charges the flat fee for /api/ai/research.
 *
 * Research runs while someone is SETTING UP an interview, before any session
 * exists, so requireSession cannot apply. Under pure time-metering it would
 * therefore be free — and it is the most expensive single request in the
 * product, a web-search model call. So for credit users it costs a flat minute,
 * which also rate-limits it: sixty lookups is one credit. Subscribers are
 * unlimited and pay nothing for it.
 *
 * Call this AFTER validating the request body, so a malformed request is not
 * billed, and BEFORE the upstream call, so a user at zero cannot get one last
 * free lookup.
 *
 * @returns {{ok: true} | {ok: false, status: number, reason: string, code?: string}}
 */
export async function chargeResearch(userId) {
  try {
    if (await isUnlimited(userId)) return { ok: true }

    const charged = await chargeMinutes({
      userId,
      minutes: RESEARCH_COST_MINUTES,
      kind: 'research_debit',
    })

    if (!charged) {
      return {
        ok: false, status: 402, code: 'out_of_credits',
        reason: 'You have run out of credits.',
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, status: 503, reason: `Could not check your balance: ${e.message}` }
  }
}

/**
 * RESUME-UPLOAD 2026-08-30: the same charge for parsing a dropped résumé.
 *
 * Deliberately a clone of chargeResearch rather than a shared helper the two
 * call: the two costs are tuned independently (see the notes on each constant in
 * lib/metering.js), and folding them together is how one gets changed for the
 * other's reasons.
 *
 * WHERE THE CALLER MUST PUT THIS: after every deterministic reason to fail —
 * size, magic bytes, ownership, text-layer check — and before the upstream call.
 * That is a step further than the research route, which charges right after
 * validating the body, and the difference matters: a scanned PDF is by far the
 * most common failure here, and the check that catches it is free and local, so
 * nobody should pay a minute for it.
 *
 * At RESUME_PARSE_COST_MINUTES = 0 this still short-circuits cleanly — a zero
 * debit is a no-op ledger row, so the path stays wired without billing anyone.
 */
export async function chargeResumeParse(userId) {
  try {
    if (RESUME_PARSE_COST_MINUTES <= 0) return { ok: true }
    if (await isUnlimited(userId)) return { ok: true }

    const charged = await chargeMinutes({
      userId,
      minutes: RESUME_PARSE_COST_MINUTES,
      kind: 'resume_parse_debit',
    })

    if (!charged) {
      return {
        ok: false, status: 402, code: 'out_of_credits',
        reason: 'You have run out of credits.',
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, status: 503, reason: `Could not check your balance: ${e.message}` }
  }
}

/**
 * Best-effort usage row. A failure here must never break the user's answer, so
 * it is deliberately not awaited by the routes.
 *
 * TELEMETRY ONLY — do not copy this pattern for anything that moves money.
 * Balance debits live in lib/metering.js, are awaited, and fail the request on
 * error; a dropped write there is a free minute.
 */
export async function recordUsage(userId, action, sessionId = null) {
  if (!userId) return
  try {
    await createAdminClient().from('usage').insert({
      user_id: userId, action, session_id: sessionId,
    })
  } catch {
    // usage tracking is not worth failing a request over
  }
}

/* RETRY 2026-08-30 ────────────────────────────────────────────────────────────
   Providers refuse work for two transient reasons, and both were reaching the
   overlay as raw upstream prose — the "high demand" message users were seeing.

     429  rate limit / quota. Free Gemini keys have a low per-minute ceiling, so
          this lands on the SECOND request in quick succession rather than the
          first, which is exactly how it was reported.
     503  the model is overloaded upstream. Nothing to do with us.

   Neither is a reason to fail an interview answer on the first try. Retrying is
   bounded hard, though: /api/ai/chat has maxDuration 60 and someone is sitting
   in a live conversation waiting to read the reply, so a long backoff is worse
   than an honest failure. */

const RETRY_STATUSES = new Set([429, 503])
// const RETRY_ATTEMPTS = 3
const RETRY_ATTEMPTS = 2
const RETRY_CAP_MS   = 1200

/* TIMEOUT 2026-08-30: a per-attempt deadline, and it is the important half.

   fetch() has no default timeout. When Gemini is overloaded it does not refuse
   quickly — measured, it took 11s, 16s and 46s to eventually answer 503. With
   three retries stacked on top, a single question could hang for over a minute
   with nothing on screen but the three dots. Retrying without a deadline turned
   a slow upstream into a worse one.

   The cap is chosen against measured healthy latency (0.7–4s to first token),
   so a real answer is never cut off, and a stalled one gives up while the
   interviewer can still act on the silence. */
const ATTEMPT_TIMEOUT_MS = 12000

export async function fetchWithRetry(url, init, { timeoutMs = ATTEMPT_TIMEOUT_MS } = {}) {
  let response
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      response = await fetch(url, { ...init, signal: controller.signal })
    } catch (e) {
      // An abort is a timeout, and a timeout is retryable — but the last one
      // has to surface as a real error rather than an undefined response.
      if (e.name !== 'AbortError') throw e
      if (attempt === RETRY_ATTEMPTS - 1) {
        throw Object.assign(
          new Error(`The AI provider did not respond within ${Math.round(timeoutMs / 1000)}s.`),
          { status: 504 })
      }
      continue
    } finally {
      clearTimeout(timer)
    }

    if (!RETRY_STATUSES.has(response.status)) return response
    if (attempt === RETRY_ATTEMPTS - 1) break

    // Prefer the provider's own Retry-After when it sends one; it knows better
    // than our guess. Still capped — a 60s hint is not worth honouring here,
    // and the attempt itself may already have burned the deadline.
    const retryAfter = Number(response.headers.get('retry-after'))
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 400 * 2 ** attempt
    await new Promise((r) => setTimeout(r, Math.min(backoff, RETRY_CAP_MS)))
  }
  return response
}

/**
 * Turns an upstream refusal into something the interviewer can act on.
 *
 * The raw provider text ("The service is experiencing high demand…") reads as a
 * fault in this app and gives no hint of what to do, which is how it was
 * reported. These say who is busy and whether waiting will help.
 */
export function friendlyUpstreamMessage(status, detail, label = 'The AI provider') {
  if (status === 429) {
    return `${label} is rate-limiting this API key. Free keys allow only a few ` +
           `requests a minute — wait a moment and try again, or use a paid key.`
  }
  if (status === 503) {
    return `${label} is overloaded right now. This is on their side; try again in a moment.`
  }
  return detail
}

/** Pulls a readable message out of an OpenAI error body. */
export async function upstreamError(response) {
  try {
    const body = await response.text()
    try { return JSON.parse(body)?.error?.message || body } catch { return body }
  } catch { return 'Upstream request failed' }
}
