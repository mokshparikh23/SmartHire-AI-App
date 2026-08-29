/**
 * Single entry point for every AI call in the app.
 *
 * Pages and hooks import from here rather than from a provider module, so
 * swapping or adding a provider stays a change to this file instead of a hunt
 * through the UI. OpenAI is currently the only provider: the Groq and Anthropic
 * paths were removed.
 */
import {
  askOpenAI,
  askOpenAIStream,
  transcribeAudio,
  verifyApiKey as verifyOpenAIKey,
  getApiKey as getOpenAIKey,
  resolveModel,
  DEFAULT_CHAT_MODEL,
  TRANSCRIBE_MODEL,
} from './openai'

export const PROVIDER = 'openai'

export { DEFAULT_CHAT_MODEL, TRANSCRIBE_MODEL, resolveModel }

/** Chat models offered in Settings. */
export const CHAT_MODELS = [
  { id: 'gpt-4o',        label: 'GPT-4o',        desc: 'Best quality', badge: '⭐' },
  { id: 'gpt-4o-mini',   label: 'GPT-4o mini',   desc: 'Fastest',      badge: '⚡' },
  { id: 'gpt-4.1',       label: 'GPT-4.1',       desc: 'Balanced',     badge: '⚖️' },
  { id: 'gpt-4.1-mini',  label: 'GPT-4.1 mini',  desc: 'Lightweight',  badge: '🪶' },
]

/** True when a key is available from Settings, localStorage or .env. */
export function hasApiKey() {
  return !!getOpenAIKey()
}

export function getApiKey() {
  return getOpenAIKey()
}

export function verifyApiKey(key) {
  return verifyOpenAIKey(key)
}

/**
 * @param {Array<{role: string, content: string}>} transcript
 * @param {string} [model]
 * @returns {Promise<string>}
 */
export function askAI(transcript, model) {
  return askOpenAI(transcript, model)
}

/**
 * @param {Array<{role: string, content: string}>} transcript
 * @param {(chunk: string) => void} onChunk
 * @param {() => void} [onDone]
 * @param {string} [model]
 */
export function askAIStream(transcript, onChunk, onDone, model) {
  return askOpenAIStream(transcript, onChunk, onDone, model)
}

/**
 * @param {Blob} audioBlob
 * @returns {Promise<string>}
 */
export function transcribe(audioBlob, fileName) {
  return transcribeAudio(audioBlob, fileName)
}
