import { CORS, jsonError } from '@/lib/http'
import { startSession, HEARTBEAT_SECONDS, STALE_SECONDS } from 'smarthire-data/metering'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

/**
 * Opens a metered interview session and charges the first minute up front.
 *
 * THE BODY CARRIES NO TIMESTAMP AND NO DURATION, and it must stay that way. All
 * billing time comes from the server clock inside session_settle(), so a
 * rewound system clock buys nothing. The obvious "helpful" addition here is an
 * `elapsedSeconds` field from the client; that is the one thing that would
 * break the whole model.
 *
 * Charging minute 1 immediately is what makes blocking the heartbeat pointless:
 * an attacker who firewalls it keeps the AI alive for the grace window, then has
 * to restart the session — which costs another minute. The net gain is nil.
 *
 * Status codes matter more than usual here, because the desktop app signs the
 * user out on the wrong one:
 *   402  out of credits    -> show a top-up prompt, stay signed in
 *   403  revoked / unknown -> sign out
 *   503  database trouble  -> retry, stay signed in
 */
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return jsonError('Body must be JSON', 400)
  }

  const { licenseKey, deviceId, appVersion } = body || {}
  if (!licenseKey || typeof licenseKey !== 'string') {
    return jsonError('licenseKey is required', 400)
  }

  let result
  try {
    result = await startSession({ licenseKey, deviceId, appVersion })
  } catch (e) {
    return jsonError(`Could not start the session: ${e.message}`, 503)
  }

  if (!result?.ok) {
    const status = result?.code === 'out_of_credits' ? 402 : 403
    return Response.json({
      ok: false,
      code: result?.code || 'unknown',
      reason: result?.reason || 'Could not start the session',
      minutesRemaining: result?.minutesRemaining ?? 0,
    }, { status, headers: CORS })
  }

  return Response.json({
    ok: true,
    sessionId:        result.sessionId,
    // On an unlimited subscription the app shows "Unlimited" and runs no
    // countdown. minutesRemaining is still the credit balance underneath — the
    // one the account falls back to if the subscription lapses — so the client
    // must branch on this flag rather than on the number being large.
    unlimited:        !!result.unlimited,
    minutesRemaining: result.minutesRemaining,
    minutesCharged:   result.minutesCharged,
    // Sent by the server so the cadence can be retuned without shipping a new
    // desktop build.
    heartbeatSeconds: HEARTBEAT_SECONDS,
    staleSeconds:     STALE_SECONDS,
  }, { headers: CORS })
}
