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
export async function askAIStream(transcript, onChunk, onDone, model) {
  const { webUrl, licenseKey } = await requireCredentials()
  if (!transcript?.length) throw new Error('Transcript is empty')

  const response = await fetch(`${webUrl}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ licenseKey, model, messages: messagesFor(transcript) }),
  })

  if (!response.ok) {
    throw new Error(`AI request failed (${response.status}): ${await readError(response)}`)
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
export async function askAI(transcript, model) {
  let text = ''
  await askAIStream(transcript, (chunk) => { text += chunk }, null, model)
  if (!text) throw new Error('The assistant returned an empty response')
  return text
}

/**
 * Speech to text.
 * @param {Blob} audioBlob
 * @returns {Promise<string>}
 */
export async function transcribe(audioBlob, fileName = 'audio.webm') {
  const { webUrl, licenseKey } = await requireCredentials()

  const form = new FormData()
  form.append('licenseKey', licenseKey)
  form.append('file', audioBlob, fileName)

  const response = await fetch(`${webUrl}/api/ai/transcribe`, {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    throw new Error(`Transcription failed (${response.status}): ${await readError(response)}`)
  }

  const data = await response.json()
  return data?.text?.trim() || ''
}
