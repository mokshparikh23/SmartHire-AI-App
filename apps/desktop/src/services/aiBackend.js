import { buildSystemPrompt } from './systemPrompt'

/**
 * Client for the AI endpoints on our own web app.
 *
 * The app deliberately holds no OpenAI credential. Anything shipped to a
 * desktop machine can be read out of the bundle, so the key lives on the
 * server and the user's licence key is what authorises a call. Users never
 * see, enter, or need an API key.
 */

let cachedWebUrl = null
let cachedLicenseKey = null

async function getWebUrl() {
  if (cachedWebUrl) return cachedWebUrl
  cachedWebUrl = (await window.electronAPI?.getWebUrl?.()) || ''
  return cachedWebUrl
}

async function getLicenseKey() {
  if (cachedLicenseKey) return cachedLicenseKey
  const saved = await window.electronAPI?.getLicense?.()
  cachedLicenseKey = saved?.key || ''
  return cachedLicenseKey
}

/** Called on sign-out so the next user does not inherit the previous licence. */
export function resetCredentials() {
  cachedLicenseKey = null
}

/* SESSION GATE 2026-08-29: /api/ai/chat and /api/ai/transcribe were put behind
   requireSession(licenseKey, sessionId) by commit 4b2c816, but this client was
   never updated — every AI call was coming back 402 no_session.

   The session lifecycle that produces that id lives in the MAIN process
   (session:start / session:heartbeat / session:stop in electron/main.cjs), not
   here, for the reason lib/http.js spells out: the session routes send no CORS
   headers because they are meant to be called from Node, and this module runs
   in the renderer — origin "null" once the app is packaged and loading from
   file://. /api/ai/* does send CORS, so those calls stay in this file.

   The renderer only ever holds the sessionId that main hands back, and passes
   it to the two calls below. */

async function requireCredentials() {
  const [webUrl, licenseKey] = await Promise.all([getWebUrl(), getLicenseKey()])
  if (!webUrl) throw new Error('Backend URL is not configured')
  if (!licenseKey) throw new Error('No active licence. Sign in to activate the app.')
  return { webUrl, licenseKey }
}

/** True once the app has an activated licence — the only thing AI calls need. */
export async function hasCredentials() {
  try {
    const { licenseKey } = await requireCredentials()
    return !!licenseKey
  } catch {
    return false
  }
}

async function readError(response) {
  try {
    const body = await response.text()
    try { return JSON.parse(body)?.error || body } catch { return body }
  } catch { return '' }
}

/**
 * SESSION GATE 2026-08-29: like readError, but keeps the `code` jsonError puts
 * alongside `error` (out_of_credits, no_session, request_limit). The overlay
 * branches on it, so flattening the body to a string throws that away.
 */
async function readErrorDetail(response) {
  try {
    const body = await response.text()
    try {
      const parsed = JSON.parse(body)
      return { message: parsed?.error || body, code: parsed?.code }
    } catch {
      return { message: body, code: undefined }
    }
  } catch {
    return { message: '', code: undefined }
  }
}

function messagesFor(transcript) {
  return [{ role: 'system', content: buildSystemPrompt() }, ...transcript]
}

async function pumpStream(response, onChunk) {
  const reader  = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const json = line.slice(6).trim()
      if (json === '[DONE]') continue
      try {
        const chunk = JSON.parse(json).choices?.[0]?.delta?.content
        if (chunk) onChunk(chunk)
      } catch {
        // ignore malformed SSE lines
      }
    }
  }
}

/**
 * Streaming answer. onChunk(text) per token, onDone() at the end.
 */
// SESSION GATE 2026-08-29: sessionId added — the route rejects a body without
// one, so this signature is not optional despite the parameter reading like it.
// export async function askAIStream(transcript, onChunk, onDone, model) {
export async function askAIStream(transcript, onChunk, onDone, model, sessionId) {
  const { webUrl, licenseKey } = await requireCredentials()
  if (!transcript?.length) throw new Error('Transcript is empty')

  const response = await fetch(`${webUrl}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // body: JSON.stringify({ licenseKey, model, messages: messagesFor(transcript) }),
    body: JSON.stringify({ licenseKey, sessionId, model, messages: messagesFor(transcript) }),
  })

  if (!response.ok) {
    // SESSION GATE 2026-08-29: the status and code ride along on the error, so
    // the overlay can tell "you are out of credits" (402, offer a top-up) from
    // "your licence is gone" (403, sign out) instead of printing one red string.
    // throw new Error(`AI request failed (${response.status}): ${await readError(response)}`)
    const detail = await readErrorDetail(response)
    const error = new Error(detail.message || `AI request failed (${response.status})`)
    error.status = response.status
    error.code   = detail.code
    throw error
  }

  try {
    await pumpStream(response, onChunk)
  } finally {
    if (onDone) onDone()
  }
}

/**
 * Non-streaming answer, collected from the same stream so there is only one
 * endpoint to maintain.
 */
// export async function askAI(transcript, model) {
export async function askAI(transcript, model, sessionId) {
  let text = ''
  // await askAIStream(transcript, (chunk) => { text += chunk }, null, model)
  await askAIStream(transcript, (chunk) => { text += chunk }, null, model, sessionId)
  if (!text) throw new Error('The assistant returned an empty response')
  return text
}

/**
 * Speech to text.
 * @param {Blob} audioBlob
 * @returns {Promise<string>}
 */
// SESSION GATE 2026-08-29: the transcribe route reads sessionId off the form and
// gates on it exactly like /chat, so the mic path was 402-ing too.
// export async function transcribe(audioBlob, fileName = 'audio.webm') {
export async function transcribe(audioBlob, fileName = 'audio.webm', sessionId) {
  const { webUrl, licenseKey } = await requireCredentials()

  const form = new FormData()
  form.append('licenseKey', licenseKey)
  form.append('sessionId', sessionId || '')
  form.append('file', audioBlob, fileName)

  const response = await fetch(`${webUrl}/api/ai/transcribe`, {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    // throw new Error(`Transcription failed (${response.status}): ${await readError(response)}`)
    const detail = await readErrorDetail(response)
    const error = new Error(detail.message || `Transcription failed (${response.status})`)
    error.status = response.status
    error.code   = detail.code
    throw error
  }

  const data = await response.json()
  return data?.text?.trim() || ''
}

/* LIVE CAPTION 2026-08-30 ─────────────────────────────────────────────────────
   Hands an SDP offer to our own backend and gets the answer back.

   Note what this function does NOT return: any kind of credential. The backend
   mints the ephemeral secret and spends it on the SDP exchange itself, so the
   promise at the top of aiRouter.js — that this app ships no API credential of
   any kind — stays literally true on the realtime path too.

   `code: 'realtime_unsupported'` (HTTP 501) is not a failure to report. It means
   the server is on the Gemini provider, and the caller is expected to fall back
   to transcribe() above. */
export async function openRealtimeCall(sdp, sessionId) {
  const { webUrl, licenseKey } = await requireCredentials()

  const response = await fetch(`${webUrl}/api/ai/realtime`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ licenseKey, sessionId: sessionId || '', sdp }),
  })

  if (!response.ok) {
    const detail = await readErrorDetail(response)
    const error = new Error(detail.message || `Live transcription failed (${response.status})`)
    error.status = response.status
    error.code   = detail.code
    throw error
  }

  return response.json()
}
