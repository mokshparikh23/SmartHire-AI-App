import {
  OPENAI_BASE, CORS, TRANSCRIBE_MODEL,
  getOpenAIKey, requireSession, recordUsage, jsonError, upstreamError,
} from '@/lib/ai'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// Interview audio arrives in short utterances; anything larger is not speech
// we recorded and should not be forwarded to OpenAI at our expense.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024

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

  let apiKey
  try {
    apiKey = getOpenAIKey()
  } catch (e) {
    return jsonError(e.message, 500)
  }

  const upstreamForm = new FormData()
  // Whisper infers the container from the filename, so the extension has to
  // match what MediaRecorder actually produced.
  upstreamForm.append('file', file, file.name || 'audio.webm')
  upstreamForm.append('model', TRANSCRIBE_MODEL)
  upstreamForm.append('response_format', 'json')
  upstreamForm.append('language', 'en')

  let upstream
  try {
    upstream = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstreamForm,
    })
  } catch (e) {
    return jsonError(`Could not reach OpenAI: ${e.message}`, 502)
  }

  if (!upstream.ok) {
    return jsonError(await upstreamError(upstream), upstream.status)
  }

  const data = await upstream.json()

  recordUsage(gate.session.userId, 'transcribe', sessionId)

  return Response.json({ text: data?.text?.trim() || '' }, { headers: CORS })
}
