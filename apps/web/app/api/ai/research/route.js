import {
  OPENAI_BASE, CORS, RESEARCH_MODEL, RESEARCH_MAX_TOKENS,
  getOpenAIKey, requireLicense, chargeResearch, recordUsage, jsonError, upstreamError,
} from '@/lib/ai'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// Free text from a setup form, pasted straight into a model prompt. Cap it so a
// giant paste cannot inflate the request.
const MAX_FIELD_CHARS = 200

/**
 * Company and role background, fetched once while the interviewer is setting up
 * a session. Deliberately separate from /api/ai/chat: this is a single
 * non-streaming call with web search enabled, and folding it into the chat route
 * would mean moving that route off its SSE passthrough for no gain.
 */
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

function clean(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_FIELD_CHARS) : ''
}

/**
 * Walks the Responses API output. Text arrives as `output_text` parts on the
 * assistant message; sources are `url_citation` annotations hanging off those
 * parts, not a top-level list.
 */
function extractResearch(data) {
  let text = ''
  const sources = new Map()   // url -> title, deduped; one page is often cited repeatedly

  for (const item of data?.output ?? []) {
    if (item?.type !== 'message') continue
    for (const part of item?.content ?? []) {
      if (part?.type !== 'output_text') continue
      text += part.text ?? ''
      for (const note of part?.annotations ?? []) {
        if (note?.type === 'url_citation' && note.url && !sources.has(note.url)) {
          sources.set(note.url, note.title || note.url)
        }
      }
    }
  }

  return {
    text: text.trim(),
    sources: [...sources].map(([url, title]) => ({ url, title })),
  }
}

function buildPrompt(company, role) {
  return `Research ${company}${role ? ` and what the ${role} role there involves` : ''}.

This is background for someone about to interview a candidate for that job. Give
them what is actually useful in the room:

- What the company builds and how it makes money.
- The engineering or team context for this role, if you can find it.
- Anything that changed recently — funding, layoffs, a product launch, a public
  incident, a migration they wrote about.
- Two or three things worth asking a candidate about, given the above.

Rules:
- Only state what you found. If the search turned up little, say so and stop.
  A short honest answer beats a padded one.
- No hiring advice about the candidate, and nothing about compensation norms.
- Plain sentences, no marketing language, under 300 words.`
}

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return jsonError('Body must be JSON', 400)
  }

  const { licenseKey } = body || {}

  const gate = await requireLicense(licenseKey)
  if (!gate.ok) return jsonError(gate.reason, gate.status)

  const company = clean(body?.company)
  const role    = clean(body?.role)
  if (!company) return jsonError('company is required', 400)

  let apiKey
  try {
    apiKey = getOpenAIKey()
  } catch (e) {
    return jsonError(e.message, 500)
  }

  // This runs at SETUP time, before a session exists, so it cannot be gated on
  // one — which under time-metering would leave the most expensive call in the
  // product free. It costs a flat minute instead.
  //
  // Charged here, after the request is known to be well formed and answerable,
  // so nobody pays for a 400 or a missing server key, and before the upstream
  // call, so a user at zero cannot get one last free lookup.
  const charge = await chargeResearch(gate.license.userId)
  if (!charge.ok) return jsonError(charge.reason, charge.status, { code: charge.code })

  const input = buildPrompt(company, role)
  const call = (tool) => fetch(`${OPENAI_BASE}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: RESEARCH_MODEL,
      max_output_tokens: RESEARCH_MAX_TOKENS,
      tools: [{ type: tool }],
      input,
    }),
  })

  let upstream
  try {
    upstream = await call('web_search')

    // The search tool has been renamed once already (web_search_preview ->
    // web_search) and which name a given model accepts is not something this
    // route can know ahead of time. A 400 naming the tool is that mismatch, not
    // a bad request from us, so try the older name before giving up.
    if (upstream.status === 400) {
      const detail = await upstream.clone().text()
      if (/web_search/.test(detail)) upstream = await call('web_search_preview')
    }
  } catch (e) {
    return jsonError(`Could not reach OpenAI: ${e.message}`, 502)
  }

  if (!upstream.ok) {
    return jsonError(await upstreamError(upstream), upstream.status)
  }

  const { text, sources } = extractResearch(await upstream.json())

  // The desktop app treats an empty result as "no research" and starts the
  // session without it, so this is a 200 with nothing in it, not an error.
  recordUsage(gate.license.userId, 'research', null)

  return Response.json({ text, sources }, { headers: CORS })
}
