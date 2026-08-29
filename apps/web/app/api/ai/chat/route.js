import {
  OPENAI_BASE, CORS, MAX_TOKENS,
  resolveModel, getOpenAIKey, requireLicense, recordUsage, jsonError, upstreamError,
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

  const { licenseKey, messages, model } = body || {}

  const gate = await requireLicense(licenseKey)
  if (!gate.ok) return jsonError(gate.reason, gate.status)

  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonError('messages must be a non-empty array', 400)
  }

  let apiKey
  try {
    apiKey = getOpenAIKey()
  } catch (e) {
    return jsonError(e.message, 500)
  }

  let upstream
  try {
    upstream = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: resolveModel(model),
        max_tokens: MAX_TOKENS,
        stream: true,
        messages,
      }),
    })
  } catch (e) {
    return jsonError(`Could not reach OpenAI: ${e.message}`, 502)
  }

  if (!upstream.ok) {
    return jsonError(await upstreamError(upstream), upstream.status)
  }

  // Not awaited: a usage-tracking failure must not delay or break the answer.
  recordUsage(gate.license.userId, 'answer')

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
