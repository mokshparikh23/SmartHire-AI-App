import { validateLicense } from '@/lib/license'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// How often the server re-checks the license while the stream is open.
const POLL_MS = 5000

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

      while (open && Date.now() < deadline) {
        let result = null
        try {
          result = await validateLicense(licenseKey)
        } catch {
          // Transient database trouble must never look like a revocation —
          // the client logs the user out on valid:false. Skip this round.
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
