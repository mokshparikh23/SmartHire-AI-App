import { CORS, jsonError } from '@/lib/http'
import { heartbeatSession, HEARTBEAT_SECONDS } from 'smarthire-data/metering'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

/**
 * Advances the meter for a live session.
 *
 * `stop: true` COMES BACK WITH HTTP 200. Running out of credits is an ordinary
 * outcome, not an error — and a 4xx here would drive the desktop app down its
 * error path, which ends in signing the user out and deleting their stored key.
 * The only non-2xx responses are a genuinely bad credential (403) and a database
 * failure (503, meaning "retry", not "your licence is gone").
 *
 * Replayed or over-eager beats are free: session_settle() derives the minute
 * count from the server clock and compares it against minutes_charged, so
 * calling this twenty times inside one minute charges exactly one minute.
 */
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return jsonError('Body must be JSON', 400)
  }

  const { licenseKey, sessionId } = body || {}
  if (!licenseKey || !sessionId) {
    return jsonError('licenseKey and sessionId are required', 400)
  }

  let beat
  try {
    beat = await heartbeatSession({ sessionId, licenseKey })
  } catch (e) {
    return jsonError(`Could not reach the meter: ${e.message}`, 503)
  }

  if (!beat?.ok) {
    // An unknown session id is a client bug or a swept session, not a bad
    // licence — the app should stop the session, not sign out.
    const status = beat?.code === 'no_session' ? 410 : 403
    return Response.json({
      ok: false,
      code: beat?.code || 'unknown',
      reason: beat?.reason || 'Session is not valid',
    }, { status, headers: CORS })
  }

  return Response.json({
    ok: true,
    sessionId:        beat.sessionId,
    metered:          !!beat.metered,
    stop:             !!beat.stop,
    reason:           beat.reason ?? null,
    minutesRemaining: beat.minutesRemaining,
    minutesElapsed:   beat.minutesElapsed,
    minutesCharged:   beat.minutesCharged,
    heartbeatSeconds: HEARTBEAT_SECONDS,
  }, { headers: CORS })
}
