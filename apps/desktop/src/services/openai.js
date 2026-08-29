import { buildSystemPrompt } from './systemPrompt'
import { useSettingsStore } from '../store/settingsStore'

const API_BASE = 'https://api.openai.com/v1'

export const DEFAULT_CHAT_MODEL = 'gpt-4o'
export const TRANSCRIBE_MODEL   = 'whisper-1'

const MAX_TOKENS = 1024

/**
 * The key can come from three places, in priority order: the Settings screen,
 * the localStorage copy that Settings also writes, and a .env file for
 * developers. Settings wins so a key typed in the app always takes effect.
 */
export function getApiKey() {
  const fromStore = useSettingsStore.getState().openaiKey
  const fromLocal = typeof localStorage !== 'undefined' ? localStorage.getItem('openai_key') : ''
  return (fromStore || fromLocal || import.meta.env.VITE_OPENAI_API_KEY || '').trim()
}

function requireApiKey() {
  const key = getApiKey()
  if (!key) {
    throw new Error('No OpenAI API key. Add one in Settings, or set VITE_OPENAI_API_KEY in apps/desktop/.env')
  }
  return key
}

/**
 * Settings persists the chosen model, so an install that ran during the Groq or
 * Claude era still has a name like "llama-3.3-70b-versatile" or "claude" saved.
 * Anything that is not an OpenAI chat model falls back to the default rather
 * than being sent to the API and rejected.
 */
export function resolveModel(model) {
  return typeof model === 'string' && model.startsWith('gpt-') ? model : DEFAULT_CHAT_MODEL
}

function messagesFor(transcript) {
  return [{ role: 'system', content: buildSystemPrompt() }, ...transcript]
}

async function readError(response) {
  try {
    const body = await response.text()
    try {
      const parsed = JSON.parse(body)
      return parsed?.error?.message || body
    } catch {
      return body
    }
  } catch {
    return ''
  }
}

/**
 * Consumes an OpenAI SSE stream, calling onChunk with each token of content.
 * The wire format is `data: {json}` per line, ending with `data: [DONE]`.
 */
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
 * Single-shot completion.
 * @param {Array<{role: string, content: string}>} transcript
 * @param {string} [model]
 * @returns {Promise<string>}
 */
export async function askOpenAI(transcript, model) {
  const apiKey = requireApiKey()
  if (!transcript?.length) throw new Error('Transcript is empty')

  let response
  try {
    response = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: resolveModel(model),
        max_tokens: MAX_TOKENS,
        messages: messagesFor(transcript),
      }),
    })
  } catch (networkErr) {
    throw new Error(`Network error calling OpenAI: ${networkErr.message}`)
  }

  if (!response.ok) {
    throw new Error(`OpenAI API error ${response.status}: ${await readError(response)}`)
  }

  const data = await response.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenAI returned an empty response')

  return text
}

/**
 * Streaming completion — onChunk(text) per token, onDone() at the end.
 */
export async function askOpenAIStream(transcript, onChunk, onDone, model) {
  const apiKey = requireApiKey()
  if (!transcript?.length) throw new Error('Transcript is empty')

  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: resolveModel(model),
      max_tokens: MAX_TOKENS,
      stream: true,
      messages: messagesFor(transcript),
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error ${response.status}: ${await readError(response)}`)
  }

  try {
    await pumpStream(response, onChunk)
  } finally {
    if (onDone) onDone()
  }
}

/**
 * Speech to text via Whisper.
 * @param {Blob} audioBlob
 * @returns {Promise<string>} transcribed text, trimmed
 */
export async function transcribeAudio(audioBlob, fileName = 'audio.webm') {
  const apiKey = requireApiKey()

  const form = new FormData()
  form.append('file', audioBlob, fileName)
  form.append('model', TRANSCRIBE_MODEL)
  form.append('response_format', 'json')
  form.append('language', 'en')

  const response = await fetch(`${API_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!response.ok) {
    throw new Error(`Whisper API error ${response.status}: ${await readError(response)}`)
  }

  const data = await response.json()
  return data?.text?.trim() || ''
}

/**
 * Cheapest authenticated call there is — used by the "Test Key" button.
 * @returns {Promise<boolean>}
 */
export async function verifyApiKey(key) {
  const candidate = (key || '').trim()
  if (!candidate) return false
  try {
    const response = await fetch(`${API_BASE}/models`, {
      headers: { Authorization: `Bearer ${candidate}` },
    })
    return response.ok
  } catch {
    return false
  }
}
