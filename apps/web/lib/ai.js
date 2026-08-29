import { validateLicense } from './license'
import { createAdminClient } from './supabase-server'
import { heartbeatSession, chargeMinutes, isUnlimited, RESEARCH_COST_MINUTES } from './metering'

export const OPENAI_BASE = 'https://api.openai.com/v1'

// Moved to lib/http.js so the session routes can share them. Re-exported here so
// every existing `import { CORS, jsonError } from '@/lib/ai'` keeps working.
export { CORS, jsonError } from './http'

/**
 * Callers pick the model, so it has to be constrained: without this an
 * extracted licence key could bill us for the most expensive model available.
 */
const ALLOWED_MODELS = new Set(['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'])
export const DEFAULT_MODEL    = 'gpt-4o'
export const TRANSCRIBE_MODEL = 'whisper-1'
export const MAX_TOKENS = 1024

/**
 * Company research is a one-shot server-side call, so the caller does not get to
 * pick the model — it is pinned here rather than added to ALLOWED_MODELS. That
 * allowlist exists to cap what a leaked licence key can bill us for, and a
 * web-search call costs more per request than a chat completion.
 */
export const RESEARCH_MODEL = 'gpt-4.1'
export const RESEARCH_MAX_TOKENS = 900

export function resolveModel(model) {
  return ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL
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
    beat = await heartbeatSession({ sessionId, licenseKey, aiRequest: true })
  } catch (e) {
    // A database failure is not a verdict. 503 tells the client to retry.
    return { ok: false, status: 503, reason: `Could not verify the session: ${e.message}` }
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

/** Pulls a readable message out of an OpenAI error body. */
export async function upstreamError(response) {
  try {
    const body = await response.text()
    try { return JSON.parse(body)?.error?.message || body } catch { return body }
  } catch { return 'Upstream request failed' }
}
