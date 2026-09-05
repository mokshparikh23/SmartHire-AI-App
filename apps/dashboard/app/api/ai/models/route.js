import { CORS, jsonError } from '@/lib/http'
import { requireLicense, activeProvider } from '@/lib/ai'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

/**
 * GEMINI-FALLBACK 2026-08-30
 *
 * Which models the server can actually serve.
 *
 * The desktop used to ship a hardcoded list of OpenAI model names in
 * aiRouter.js. With the provider chosen by which key the SERVER holds, that list
 * became a guess — on a Gemini backend it would offer four GPT names, each of
 * which resolveModel() silently rewrites to the Gemini default. A picker whose
 * options do nothing is worse than no picker, so the list comes from here.
 *
 * requireLicense, not requireSession: the launcher shows this before any session
 * exists, and it costs nothing to serve.
 */
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return jsonError('Body must be JSON', 400)
  }

  const gate = await requireLicense(body?.licenseKey)
  if (!gate.ok) return jsonError(gate.reason, gate.status)

  const provider = activeProvider()
  if (!provider) {
    // 200 with configured:false, not an error: the desktop should render "the
    // server has no AI provider" as a state, not fail its launcher on it.
    return Response.json({
      ok: true, configured: false, provider: null, defaultModel: null, models: [],
    }, { headers: CORS })
  }

  return Response.json({
    ok: true,
    configured: true,
    provider: provider.id,
    providerLabel: provider.label,
    defaultModel: provider.defaultModel,
    models: provider.models,
  }, { headers: CORS })
}
