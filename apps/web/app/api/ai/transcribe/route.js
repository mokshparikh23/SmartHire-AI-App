import {
  OPENAI_BASE, GEMINI_NATIVE_BASE, CORS, TRANSCRIBE_MODEL, GEMINI_TRANSCRIBE_MODEL,
  requireProvider, requireSession, recordUsage, jsonError, upstreamError,
  fetchWithRetry, friendlyUpstreamMessage,
} from '@/lib/ai'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// Interview audio arrives in short utterances; anything larger is not speech
// we recorded and should not be forwarded to OpenAI at our expense.
// GEMINI-FALLBACK 2026-08-30: lowered from 25 MB. Gemini's inline path caps the
// WHOLE request at 20 MB and base64 inflates the audio by about a third, so 25
// MB of webm could not fit even alone. 8 MB is still minutes of opus speech —
// far more than the seconds-long utterances useVoice actually sends.
// const MAX_AUDIO_BYTES = 25 * 1024 * 1024
const MAX_AUDIO_BYTES = 8 * 1024 * 1024

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

/**
 * Whisper transcription on behalf of a licensed desktop client.
 * Multipart body: licenseKey + file.
 */
export async function POST(request) {
  let form
  try {
    form = await request.formData()
  } catch {
    return jsonError('Body must be multipart/form-data', 400)
  }

  // Gated exactly like /chat. Leaving transcription open while chat is closed
  // would be the expensive half: useVoice fires this on every utterance, and
  // Whisper is billed to us on every call.
  const sessionId = form.get('sessionId')
  const gate = await requireSession(form.get('licenseKey'), sessionId)
  if (!gate.ok) return jsonError(gate.reason, gate.status, { code: gate.code })

  const file = form.get('file')
  if (!file || typeof file === 'string') {
    return jsonError('file is required', 400)
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return jsonError('Audio file is too large', 413)
  }

  let provider, apiKey
  try {
    ({ provider, apiKey } = requireProvider())
  } catch (e) {
    return jsonError(e.message, 500)
  }

  /* GEMINI-FALLBACK 2026-08-30 ────────────────────────────────────────────────
     This is the one route the OpenAI-compatibility layer cannot carry.

     Gemini exposes no /audio/transcriptions at all, and its compat `input_audio`
     content part documents only wav — while useVoice records
     audio/webm;codecs=opus. Re-encoding to wav in the renderer would mean
     hand-rolling a WAV writer over the AudioContext PCM and sending several
     times the bytes per utterance, on a path that fires on every pause in
     speech. The native surface takes webm inline instead, so the recorder is
     left alone and the difference is contained here. */

  let text
  try {
    text = provider.id === 'gemini'
      ? await transcribeWithGemini(file, apiKey)
      : await transcribeWithWhisper(file, apiKey)
  } catch (e) {
    // A transcription failure is per-utterance, not fatal to the session —
    // useVoice logs and drops it, and the next utterance tries again.
    return jsonError(e.message, e.status || 502)
  }

  recordUsage(gate.session.userId, 'transcribe', sessionId)

  return Response.json({ text }, { headers: CORS })
}

async function transcribeWithWhisper(file, apiKey) {
  const form = new FormData()
  // Whisper infers the container from the filename, so the extension has to
  // match what MediaRecorder actually produced.
  form.append('file', file, file.name || 'audio.webm')
  form.append('model', TRANSCRIBE_MODEL)
  form.append('response_format', 'json')
  form.append('language', 'en')

  let upstream
  try {
    upstream = await fetchWithRetry(`${OPENAI_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
  } catch (e) {
    throw Object.assign(new Error(`Could not reach OpenAI: ${e.message}`), { status: 502 })
  }

  if (!upstream.ok) {
    throw Object.assign(
      new Error(friendlyUpstreamMessage(upstream.status, await upstreamError(upstream), 'OpenAI')),
      { status: upstream.status })
  }

  const data = await upstream.json()
  return data?.text?.trim() || ''
}

/**
 * Gemini's native transcription: one call, audio inline as base64.
 *
 * Inline rather than the Files API on purpose — the Files route would make this
 * two round trips for every utterance in a live interview. The 20 MB request
 * ceiling is far above anything this sends; MAX_AUDIO_BYTES caps us well under.
 */
async function transcribeWithGemini(file, apiKey) {
  const mime = (file.type || 'audio/webm').split(';')[0]   // strip ";codecs=opus"
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')

  let upstream
  try {
    // RETRY 2026-08-30: this fires on EVERY utterance, so it is the first
    // thing to hit a free key's per-minute ceiling in a real interview.
    upstream = await fetchWithRetry(`${GEMINI_NATIVE_BASE}/interactions`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GEMINI_TRANSCRIBE_MODEL,
        input: [
          // The instruction matters: without it the model narrates the clip
          // ("A person asks about...") instead of transcribing it, and useVoice
          // feeds whatever comes back straight in as the interview question.
          { type: 'text', text:
            'Transcribe this audio verbatim. Output only the spoken words, with no ' +
            'preamble, quotation marks, speaker labels or commentary. If there is no ' +
            'intelligible speech, output nothing at all.' },
          { type: 'audio', data: base64, mime_type: mime },
        ],
      }),
    })
  } catch (e) {
    throw Object.assign(new Error(`Could not reach Gemini: ${e.message}`), { status: 502 })
  }

  if (!upstream.ok) {
    throw Object.assign(
      new Error(friendlyUpstreamMessage(upstream.status, await upstreamError(upstream), 'Gemini')),
      { status: upstream.status })
  }

  return extractGeminiText(await upstream.json())
}

/**
 * Pulls the transcript out of an /interactions response.
 *
 * The shape, confirmed against the live API:
 *
 *   { steps: [ { type: 'thought',      signature: '...' },
 *              { type: 'model_output', content: [ { type: 'text', text: '…' } ] } ] }
 *
 * ONLY `model_output` steps are read, and that restriction is the point rather
 * than tidiness. These are thinking models — a trivial prompt still burned 95
 * thought tokens — and a `thought` step carrying text would otherwise be
 * concatenated into the transcript. useVoice feeds whatever comes back straight
 * in as the interview question, so the model's private reasoning would appear
 * on screen as something the candidate said.
 *
 * The generic walk below is kept only as a fallback for a shape change, and it
 * is scoped to model_output for the same reason.
 */
export function extractGeminiText(body) {
  const steps = Array.isArray(body?.steps) ? body.steps : []
  const fromSteps = steps
    .filter((s) => s?.type === 'model_output')
    .flatMap((s) => (Array.isArray(s.content) ? s.content : []))
    .filter((c) => typeof c?.text === 'string')
    .map((c) => c.text)
    .join(' ')
    .trim()

  if (fromSteps) return fromSteps

  // Fallbacks, in order of how likely they are to be the successor shape.
  if (typeof body?.output_text === 'string') return body.output_text.trim()

  const parts = body?.candidates?.[0]?.content?.parts
  if (Array.isArray(parts)) {
    return parts.filter((p) => typeof p?.text === 'string').map((p) => p.text).join(' ').trim()
  }

  return ''
}
