import { CORS, jsonError } from '@/lib/http'
import { stopSession } from '@/lib/metering'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

/**
 * Closes a session and settles the final minute.
 *
 * Idempotent: stopping an already-closed session returns its settled figures
 * rather than an error, so a retry or a duplicate fired from a quit handler is
 * harmless.
 *
 * The body is read with request.text() + JSON.parse rather than request.json()
 * so this also accepts a text/plain beacon. sendBeacon cannot set a
 * Content-Type of application/json without turning the request into a
 * preflighted one, and a preflight is exactly what does not complete while a
 * window is closing.
 *
 * Do not rely on this landing at all, though. On macOS the app keeps running
 * with no windows (main.cjs does not quit on window-all-closed), and a hard
 * crash sends nothing. sweep_stale_sessions() is the real backstop; this is
 * just what makes a clean stop settle immediately instead of 90 seconds later.
 */
export async function POST(request) {
  let body
  try {
    body = JSON.parse(await request.text())
  } catch {
    return jsonError('Body must be JSON', 400)
  }

  const { licenseKey, sessionId, reason } = body || {}
  if (!licenseKey || !sessionId) {
    return jsonError('licenseKey and sessionId are required', 400)
  }

  let result
  try {
    result = await stopSession({ sessionId, licenseKey, reason })
  } catch (e) {
    return jsonError(`Could not close the session: ${e.message}`, 503)
  }

  if (!result?.ok) {
    const status = result?.code === 'no_session' ? 410 : 403
    return Response.json({
      ok: false,
      code: result?.code || 'unknown',
      reason: result?.reason || 'Session is not valid',
    }, { status, headers: CORS })
  }

  return Response.json({
    ok: true,
    sessionId:        result.sessionId,
    minutesRemaining: result.minutesRemaining,
    minutesCharged:   result.minutesCharged,
    reason:           result.reason ?? null,
  }, { headers: CORS })
}
