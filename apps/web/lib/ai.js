import { validateLicense } from './license'
import { createAdminClient } from './supabase-server'

export const OPENAI_BASE = 'https://api.openai.com/v1'

/**
 * The desktop renderer calls these routes from file:// (origin "null") in a
 * packaged build, so the AI routes have to be open. The licence key in the body
 * is what actually authorises the call.
 */
export const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

/**
 * Callers pick the model, so it has to be constrained: without this an
 * extracted licence key could bill us for the most expensive model available.
 */
const ALLOWED_MODELS = new Set(['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'])
export const DEFAULT_MODEL   = 'gpt-4o'
export const TRANSCRIBE_MODEL = 'whisper-1'
export const MAX_TOKENS = 1024

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
    return { ok: false, status: 500, reason: `Could not verify licence: ${e.message}` }
  }

  if (!result?.valid) {
    return { ok: false, status: 403, reason: result?.reason || 'Licence is not valid' }
  }

  return { ok: true, license: result }
}

/**
 * Best-effort usage row. A failure here must never break the user's answer, so
 * it is deliberately not awaited by the routes.
 */
export async function recordUsage(userId, action) {
  if (!userId) return
  try {
    await createAdminClient().from('usage').insert({ user_id: userId, action })
  } catch {
    // usage tracking is not worth failing a request over
  }
}

export function jsonError(reason, status) {
  return Response.json({ error: reason }, { status, headers: CORS })
}

/** Pulls a readable message out of an OpenAI error body. */
export async function upstreamError(response) {
  try {
    const body = await response.text()
    try { return JSON.parse(body)?.error?.message || body } catch { return body }
  } catch { return 'Upstream request failed' }
}
