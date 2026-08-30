import {
  OPENAI_BASE, CORS, REALTIME_TRANSCRIBE_MODEL,
  requireProvider, requireSession, recordUsage, jsonError, upstreamError,
  friendlyUpstreamMessage,
} from '@/lib/ai'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

/* LIVE CAPTION 2026-08-30 ─────────────────────────────────────────────────────
   WebRTC signalling for a Realtime *transcription* session, so the overlay can
   show text while someone is still speaking instead of after they stop.

   WHY THE SDP GOES THROUGH HERE instead of the renderer POSTing OpenAI directly
   — this is the whole reason the feature is cheap, and it is worth not undoing:

   - The renderer never receives a credential of ANY kind, not even the ephemeral
     `ek_`. It sends an offer and gets an answer SDP, which is an opaque media
     negotiation blob. The promise at the top of services/aiRouter.js survives
     literally rather than being softened to "ships no LONG-LIVED key".
   - No CSP change. connect-src does not govern RTCPeerConnection at all, and the
     one fetch involved lands on our own origin, already allowed by the
     connectSrc logic in electron/main.cjs.
   - A packaged renderer loads from file:// with origin "null". Posting
     api.openai.com directly would hang on whether OpenAI echoes that back in
     CORS. Going through here removes the question.
   - `Location: /v1/realtime/calls/rtc_...` is read HERE, so the client cannot
     withhold or forge the call id. That id is what lets a future heartbeat hang
     up a call server-side when credits run out — see the Stage 2 note below.

   Netlify holds no socket: this is two short HTTPS requests, then the media
   flows renderer <-> OpenAI over SRTP with no further involvement from us.

   VERIFIED against the live API before this was written (standalone Electron
   probe, real loopback audio):
     - mint with {session:{type:'transcription'}} -> 200, value starts `ek_`
     - POST that ek_ to /v1/realtime/calls with the offer SDP -> 201 + Location
     - conversation.item.input_audio_transcription.delta arrives DURING speech,
       roughly one word every 200ms
   The `ek_` is accepted by /realtime/calls, so this never spends the real key on
   the second call. */

// GEMINI-FALLBACK: Gemini has a Live API that could do this, but requireProvider
// picks ONE provider for the whole app and OpenAI wins whenever both keys are
// set. A Gemini branch here would be dead code on the primary deployment, so the
// client is told to fall back to the HTTP transcribe path instead.
const UNSUPPORTED_PROVIDER = 'realtime_unsupported'

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return jsonError('Body must be JSON', 400)
  }

  const { licenseKey, sessionId, sdp } = body || {}

  // Gated exactly like /chat and /transcribe. Opening a live socket is the most
  // expensive thing this app can do per minute, so it must not be the one route
  // that skips the meter.
  const gate = await requireSession(licenseKey, sessionId)
  if (!gate.ok) return jsonError(gate.reason, gate.status, { code: gate.code })

  if (typeof sdp !== 'string' || !sdp.startsWith('v=')) {
    return jsonError('sdp must be an SDP offer', 400)
  }

  let provider, apiKey
  try {
    ({ provider, apiKey } = requireProvider())
  } catch (e) {
    return jsonError(e.message, 500)
  }

  if (provider.id !== 'openai') {
    return jsonError(
      'Live transcription needs the OpenAI provider.', 501, { code: UNSUPPORTED_PROVIDER }
    )
  }

  // ── 1. Mint an ephemeral secret scoped to a transcription session ──────────
  //
  // No turn_detection: gpt-live-transcribe rejects it outright with
  // "Turn detection is not supported for this transcription model". The desktop
  // VAD closes turns instead — see hooks/useLiveVoice.js. Do not add it back
  // without re-checking the model, or every session will 400 on this line.
  let secret
  try {
    const res = await fetch(`${OPENAI_BASE}/realtime/client_secrets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: {
          type: 'transcription',
          audio: {
            input: {
              format: { type: 'audio/pcm', rate: 24000 },
              transcription: { model: REALTIME_TRANSCRIBE_MODEL },
            },
          },
        },
      }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return jsonError(
        friendlyUpstreamMessage(res.status, JSON.stringify(data?.error || data), 'OpenAI'),
        res.status
      )
    }
    secret = data?.value
    if (!secret) return jsonError('OpenAI returned no client secret', 502)
  } catch (e) {
    return jsonError(`Could not reach OpenAI: ${e.message}`, 502)
  }

  // ── 2. Exchange SDP ────────────────────────────────────────────────────────
  //
  // Not fetchWithRetry: an SDP offer is bound to the caller's freshly-created
  // RTCPeerConnection, so a retried POST would negotiate against ICE candidates
  // the client has already given up on. A failure here is the client's to retry
  // with a new offer.
  try {
    const res = await fetch(`${OPENAI_BASE}/realtime/calls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/sdp' },
      body: sdp,
    })
    const answer = await res.text()

    if (!res.ok) {
      return jsonError(
        friendlyUpstreamMessage(res.status, await upstreamError(res).catch(() => answer), 'OpenAI'),
        res.status
      )
    }

    // STAGE 2: persist this on the session row so session_heartbeat can POST
    // /realtime/calls/{id}/hangup when it returns stop. Until then the socket
    // outlives a credit exhaustion by however long the client takes to notice —
    // bounded by the ~60 minute session ceiling, not unbounded.
    const callId = (res.headers.get('location') || '').split('/').pop() || null

    recordUsage(gate.session.userId, 'realtime_session', sessionId)

    return Response.json({ ok: true, answer, callId }, { headers: CORS })
  } catch (e) {
    return jsonError(`Could not reach OpenAI: ${e.message}`, 502)
  }
}
