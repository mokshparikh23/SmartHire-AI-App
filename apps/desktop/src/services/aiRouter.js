/**
 * Single entry point for every AI call in the app.
 *
 * Requests go to our own web backend, which holds the OpenAI key and checks the
 * user's licence. The desktop app ships no API credential of any kind: a key
 * bundled into a renderer is readable by anyone who opens the app folder, so
 * there is nothing here for a user to enter and nothing for them to leak.
 */
import {
  askAI as backendAskAI,
  askAIStream as backendAskAIStream,
  transcribe as backendTranscribe,
  openRealtimeCall as backendOpenRealtimeCall,
  hasCredentials,
  resetCredentials,
} from './aiBackend'

export const PROVIDER = 'openai-via-backend'

export const DEFAULT_CHAT_MODEL = 'gpt-4o'

/**
 * Chat models offered in Settings. Must stay a subset of ALLOWED_MODELS in the
 * web app's lib/ai.js, which is what actually enforces the choice.
 */
export const CHAT_MODELS = [
  { id: 'gpt-4o',        label: 'GPT-4o',        desc: 'Best quality', badge: 'Recommended' },
  { id: 'gpt-4o-mini',   label: 'GPT-4o mini',   desc: 'Fastest',      badge: 'Fast' },
  { id: 'gpt-4.1',       label: 'GPT-4.1',       desc: 'Balanced',     badge: '' },
  { id: 'gpt-4.1-mini',  label: 'GPT-4.1 mini',  desc: 'Lightweight',  badge: '' },
]

/**
 * Settings persists the chosen model, so installs from before this change have
 * a Groq or Claude model name saved. Anything unrecognised falls back to the
 * default; the server applies the same rule as a second line of defence.
 */
export function resolveModel(model) {
  return CHAT_MODELS.some((m) => m.id === model) ? model : DEFAULT_CHAT_MODEL
}

/** Whether AI calls can be made — i.e. the app has an activated licence. */
export function isReady() {
  return hasCredentials()
}

export { resetCredentials }

/**
 * @param {Array<{role: string, content: string}>} transcript
 * @param {string} [model]
 * @returns {Promise<string>}
 */
// SESSION GATE 2026-08-29: sessionId threaded through — the AI routes gate on it.
// export function askAI(transcript, model) {
//   return backendAskAI(transcript, resolveModel(model))
// }
export function askAI(transcript, model, sessionId) {
  return backendAskAI(transcript, resolveModel(model), sessionId)
}

/**
 * @param {Array<{role: string, content: string}>} transcript
 * @param {(chunk: string) => void} onChunk
 * @param {() => void} [onDone]
 * @param {string} [model]
 */
// export function askAIStream(transcript, onChunk, onDone, model) {
//   return backendAskAIStream(transcript, onChunk, onDone, resolveModel(model))
// }
export function askAIStream(transcript, onChunk, onDone, model, sessionId) {
  return backendAskAIStream(transcript, onChunk, onDone, resolveModel(model), sessionId)
}

/**
 * @param {Blob} audioBlob
 * @returns {Promise<string>}
 */
// export function transcribe(audioBlob, fileName) {
//   return backendTranscribe(audioBlob, fileName)
// }
export function transcribe(audioBlob, fileName, sessionId) {
  return backendTranscribe(audioBlob, fileName, sessionId)
}

/**
 * LIVE CAPTION 2026-08-30: WebRTC signalling for the realtime transcription
 * session. Goes through this module for the same reason everything else does —
 * one place that knows where the backend is.
 *
 * @param {string} sdp        the local offer
 * @param {string} sessionId
 * @returns {Promise<{ok: boolean, answer: string, callId: string|null}>}
 */
export function openRealtimeCall(sdp, sessionId) {
  return backendOpenRealtimeCall(sdp, sessionId)
}
