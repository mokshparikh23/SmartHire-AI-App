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
/* CONTEXT 2026-08-31 ─ this clamp silently destroyed every Gemini choice ──────
   CHAT_MODELS is the OpenAI list, and the comment above it claims it "must stay
   a subset of ALLOWED_MODELS in the web app's lib/ai.js". That is only true when
   the server holds an OpenAI key. On a Gemini deploy the server's allowlist is
   the Gemini one, and this rewrote every chosen Gemini id to 'gpt-4o' before the
   request left the desktop — which lib/ai.js's own resolveModel then did not
   recognise either, so it fell back to the Gemini DEFAULT.

   Net effect: the model picker in the launcher's menu did nothing at all, and
   every session ran on the fastest and weakest model available. That is exactly
   the wrong direction for a complaint about answers not being understood.

   The desktop cannot know the allowlist — which provider is active is decided by
   which API key the SERVER holds. /api/ai/models exists for this, and Launcher
   already fetches it and snaps an off-list model to the server's default. So
   this was not a second line of defence; it was a first line of damage. The
   allowlist that actually caps spend is resolveModel(model, provider) in
   apps/web/lib/ai.js, which re-checks against the provider that is really live.

   CHAT_MODELS stays exported — Launcher still uses it as the offline fallback
   list when /api/ai/models cannot be reached. */
// export function resolveModel(model) {
//   return CHAT_MODELS.some((m) => m.id === model) ? model : DEFAULT_CHAT_MODEL
// }
export function resolveModel(model) {
  return typeof model === 'string' && model ? model : DEFAULT_CHAT_MODEL
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
 * @param {string} [sessionId]
 * @param {AbortSignal} [signal]  SEGMENTATION 2026-08-30 — supersede a stream
 * @param {'general'|'coding'|'screen'} [intent]  INTENT-ROUTING 2026-09-01 — what
 *   KIND of question this is. Passed straight through: resolveModel below is the
 *   only thing this layer is allowed to have an opinion about, and it has none
 *   about the intent. The server maps it to a model.
 */
// export function askAIStream(transcript, onChunk, onDone, model) {
//   return backendAskAIStream(transcript, onChunk, onDone, resolveModel(model))
// }
// export function askAIStream(transcript, onChunk, onDone, model, sessionId) {
//   return backendAskAIStream(transcript, onChunk, onDone, resolveModel(model), sessionId)
// }
// export function askAIStream(transcript, onChunk, onDone, model, sessionId, signal) {
//   return backendAskAIStream(transcript, onChunk, onDone, resolveModel(model), sessionId, signal)
// }
export function askAIStream(transcript, onChunk, onDone, model, sessionId, signal, intent) {
  return backendAskAIStream(transcript, onChunk, onDone, resolveModel(model), sessionId, signal, intent)
}

/**
 * @param {Blob} audioBlob
 * @returns {Promise<string>}
 */
// PIPELINE 2026-08-31: `signal` threaded, so useVoice can put a deadline on an
// upload that could otherwise block its whole serial transcription chain.
// export function transcribe(audioBlob, fileName) {
//   return backendTranscribe(audioBlob, fileName)
// }
// export function transcribe(audioBlob, fileName, sessionId) {
//   return backendTranscribe(audioBlob, fileName, sessionId)
// }
export function transcribe(audioBlob, fileName, sessionId, signal) {
  return backendTranscribe(audioBlob, fileName, sessionId, signal)
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
// PIPELINE 2026-08-31: `signal` threaded, so a hung SDP exchange can be given a
// deadline instead of stranding the capture path for the whole session.
// export function openRealtimeCall(sdp, sessionId) {
//   return backendOpenRealtimeCall(sdp, sessionId)
// }
export function openRealtimeCall(sdp, sessionId, signal) {
  return backendOpenRealtimeCall(sdp, sessionId, signal)
}
