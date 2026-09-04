import { validateLicense } from 'smarthire-data/license'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// How often the server re-checks the license while the stream is open.
//
// This was 5s, which — together with the desktop's own fallback poll — meant 18
// licence lookups per minute per open app, forever. The session heartbeat is now
// a far better liveness signal than either, so this can afford to be lazy. The
// cost is that revocation takes up to 15s to reach an IDLE client; a revocation
// during a live session is caught by the next heartbeat regardless, server-side,
// in session_heartbeat().
const POLL_MS = 15000

// Serverless platforms cap function duration, so the stream closes itself well
// before the cap and lets EventSource reconnect. Revocation is still caught on
// the first check of each new connection.
const MAX_LIFETIME_MS = 50000

// The desktop renderer connects from file:// (origin "null") in a packaged
// build and from http://127.0.0.1:5173 in dev, so this has to be open. Nothing
// here is secret beyond the license key the caller already holds, and
// EventSource never sends credentials.
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Cache-Control'
}

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
  })

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET(request) {
  const licenseKey = new URL(request.url).searchParams.get('licenseKey')
  if (!licenseKey) {
    return Response.json({ error: 'licenseKey is required' }, { status: 400, headers: CORS })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let open = true

      const write = (chunk) => {
        if (!open) return
        try { controller.enqueue(encoder.encode(chunk)) } catch { open = false }
      }
      // Comments keep the connection warm without waking the client's onmessage.
      const comment = (text) => write(`: ${text}\n\n`)
      const send    = (payload) => write(`data: ${JSON.stringify(payload)}\n\n`)
      const finish  = () => {
        if (!open) return
        open = false
        try { controller.close() } catch {}
      }

      request.signal.addEventListener('abort', finish, { once: true })

      write('retry: 3000\n\n')
      send({ type: 'connected' })

      const deadline = Date.now() + MAX_LIFETIME_MS
      let lastMinutes = null

      while (open && Date.now() < deadline) {
        let result = null
        try {
          result = await validateLicense(licenseKey)
        } catch {
          // Transient database trouble must never look like a revocation — the
          // client logs the user out on valid:false. Skip this round.
          //
          // validateLicense now THROWS on a query failure rather than returning
          // valid:false, which is what finally makes this branch reachable. It
          // used to treat a Supabase blip as "licence not found".
          comment('check-failed')
        }

        if (!open) break

        if (result?.valid === false) {
          send({
            type:   'license_revoked',
            valid:  false,
            reason: result.reason || 'Access denied. Your license was revoked.'
          })
          finish()
          return
        }

        // Balance updates, so an idle app reflects a purchase or an admin grant
        // without the user touching anything.
        //
        // CRITICAL: these frames carry NO `valid` key. App.jsx signs the user
        // out on `msg.valid === false` regardless of the frame's type, and
        // running out of credits must never do that — the licence is fine, the
        // balance is simply empty. `undefined === false` is false, so an older
        // client ignores these frames rather than misreading them.
        if (result?.valid && result.minutesRemaining !== lastMinutes) {
          const wasKnown = lastMinutes !== null
          lastMinutes = result.minutesRemaining

          send({
            type: 'balance',
            minutesRemaining: lastMinutes,
            unlimited: !!result.unlimited,
          })

          if (wasKnown && !result.unlimited && lastMinutes <= 0) {
            send({ type: 'credits_exhausted', minutesRemaining: 0 })
          }
        }

        comment('keep-alive')
        await sleep(POLL_MS, request.signal)
      }

      finish()
    }
  })

  return new Response(stream, {
    headers: {
      ...CORS,
      'Content-Type':      'text/event-stream; charset=utf-8',
      'Cache-Control':     'no-cache, no-store, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  })
}
