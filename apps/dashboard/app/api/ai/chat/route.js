import {
  CORS, MAX_TOKENS, GEMINI_REASONING_EFFORT, modelForIntent, requireProvider,
  requireSession, recordUsage, jsonError, upstreamError, fetchWithRetry,
  friendlyUpstreamMessage,
} from '@/lib/ai'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

/**
 * Streaming chat completion on behalf of a licensed desktop client.
 *
 * The OpenAI key stays here. The desktop sends its licence key and the
 * conversation; it never sees a credential it could leak.
 */
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return jsonError('Body must be JSON', 400)
  }

  /* INTENT-ROUTING 2026-09-01: `intent` added — 'general' | 'coding' | 'screen'.
     The desktop says what KIND of question this is and modelForIntent() picks the
     model; see the note there for why the client cannot pick it itself. Absent on
     an older desktop build, which lands on 'general' and behaves exactly as
     before — that backwards compatibility is why this is a new field rather than
     a changed meaning for `model`. */
  // const { licenseKey, sessionId, messages, model } = body || {}
  const { licenseKey, sessionId, messages, model, intent } = body || {}

  // Advances the meter as well as checking it, and does so BEFORE the upstream
  // call, so a user at zero cannot extract one last free answer.
  const gate = await requireSession(licenseKey, sessionId)
  if (!gate.ok) return jsonError(gate.reason, gate.status, { code: gate.code })

  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonError('messages must be a non-empty array', 400)
  }

  // GEMINI-FALLBACK 2026-08-30: whichever provider has a key. Gemini's
  // OpenAI-compatible surface takes this exact body — streaming and image_url
  // vision parts included — so nothing below had to change but the base URL.
  let provider, apiKey
  try {
    ({ provider, apiKey } = requireProvider())
  } catch (e) {
    return jsonError(e.message, 500)
  }

  let upstream
  try {
    // RETRY 2026-08-30: 429/503 are retried a couple of times before the user
    // ever sees them — a free key's per-minute ceiling otherwise fails the
    // second answer in a row mid-interview.
    upstream = await fetchWithRetry(`${provider.base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // model: resolveModel(model, provider),
        model: modelForIntent(intent, model, provider),
        max_tokens: MAX_TOKENS,
        stream: true,
        // THINKING 2026-08-30: Gemini only. OpenAI rejects reasoning_effort on
        // non-reasoning models like gpt-4o, so this must not be sent blindly.
        ...(provider.id === 'gemini' ? { reasoning_effort: GEMINI_REASONING_EFFORT } : {}),
        messages,
      }),
    })
  } catch (e) {
    // A timeout from fetchWithRetry already carries its own status and a
    // message that names the deadline; wrapping it in "Could not reach…" would
    // read as a network fault and hide what actually happened.
    if (e.status === 504) return jsonError(e.message, 504, { code: 'upstream_timeout' })
    return jsonError(`Could not reach ${provider.label}: ${e.message}`, 502)
  }

  if (!upstream.ok) {
    // return jsonError(await upstreamError(upstream), upstream.status)
    return jsonError(
      friendlyUpstreamMessage(upstream.status, await upstreamError(upstream), provider.label),
      upstream.status,
      { code: upstream.status === 429 ? 'rate_limited' : undefined }
    )
  }

  // Not awaited: a usage-tracking failure must not delay or break the answer.
  // Telemetry only — the minute was already billed by requireSession.
  recordUsage(gate.session.userId, 'answer', sessionId)

  // Straight passthrough of the provider's SSE stream. Gemini's compatibility
  // layer emits the same `choices[].delta.content` frames, which is exactly why
  // it was chosen over the native API — the desktop's parser is untouched.
  // Straight passthrough of OpenAI's SSE stream — the desktop already parses
  // this format, so there is nothing to translate.
  return new Response(upstream.body, {
    headers: {
      ...CORS,
      'Content-Type':      'text/event-stream; charset=utf-8',
      'Cache-Control':     'no-cache, no-store, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
