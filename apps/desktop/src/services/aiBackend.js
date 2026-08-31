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

/* PIPELINE 2026-08-31 ─ the app had no deadline of its own ────────────────────
   There was no timeout anywhere on this path, and the server's does not cover
   what breaks. apps/web/lib/ai.js's ATTEMPT_TIMEOUT_MS aborts the upstream
   fetch — but with `stream: true` that fetch RESOLVES the moment headers
   arrive, and its finally clears the timer. The streaming BODY then has no
   deadline in the entire stack, client or server.

   So a provider that accepts the connection and stalls left reader.read()
   awaiting forever. generate()'s finally never ran, setAnswerDone() never ran,
   and isThinking stayed true for the rest of the session — with Answer,
   Screenshot and Retry all disabled on isThinking, so the app locked itself out
   of every escape hatch. That is the "aatak jaana" the owner is describing, and
   it is not recoverable without asking a whole new question.

   Two deadlines, because a stall before the first token and a stall halfway
   through an answer are different failures with different budgets. */

/* Server worst case to HEADERS is 12s x 2 attempts + one <=1.2s backoff, about
   25.2s (RETRY_ATTEMPTS / RETRY_CAP_MS in apps/web/lib/ai.js), and the
   synchronous requireSession -> session_heartbeat RPC runs before the provider
   is even called. This MUST sit above that, or we kill answers the server was
   legitimately about to deliver. Past 30s nobody mid-interview reads it anyway. */
const FIRST_TOKEN_TIMEOUT_MS = 30000

/* Once tokens are flowing, deltas arrive microtasks apart. Deliberately equal to
   the server's own per-attempt timeout, so client and server agree on what
   "too long" means rather than each having a private opinion. */
const STALL_TIMEOUT_MS = 12000

/* Backstop above the route's maxDuration = 60, for the case where the platform
   kills the function without closing our socket. */
const TOTAL_TIMEOUT_MS = 75000

/* One interval for the whole request rather than a timer re-armed per token.
   pumpStream's loop is the one path in this file with a real cost contract; it
   writes a single number and this reads it. */
const WATCHDOG_TICK_MS = 2000

function streamTimeout(kind) {
  const message = kind === 'stall'
    ? 'The answer stopped midway. Retry the question.'
    : 'The AI did not respond in time. Retry the question.'
  const error = new Error(message)
  error.status = 504
  error.code = 'stream_timeout'
  return error
}

// async function pumpStream(response, onChunk) {
// async function pumpStream(response, onChunk, signal) {
// PIPELINE 2026-08-31: `clock` is a mutable box the watchdog above reads. One
// number assignment per delivered delta — this loop must stay cheap.
async function pumpStream(response, onChunk, signal, clock) {
  const reader  = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      // SEGMENTATION 2026-08-30: an aborted fetch rejects reader.read() on its
      // own, but not always before the next chunk is delivered. Checking here as
      // well means a superseded answer stops writing on the very next loop.
      if (signal?.aborted) break

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
          // if (chunk) onChunk(chunk)
          if (chunk) {
            // PIPELINE 2026-08-31: stamp before delivering, so a slow onChunk
            // cannot be mistaken for a slow provider.
            if (clock) clock.lastChunkAt = Date.now()
            onChunk(chunk)
          }
        } catch {
          // ignore malformed SSE lines
        }
      }
    }
  } finally {
    // Close the socket rather than leaving it to GC. Without this the response
    // body stays open after an abort and the connection is held for the length
    // of the upstream generation.
    try { await reader.cancel() } catch { /* already closed */ }
  }
}

/**
 * Streaming answer. onChunk(text) per token, onDone() at the end.
 */
// SESSION GATE 2026-08-29: sessionId added — the route rejects a body without
// one, so this signature is not optional despite the parameter reading like it.
/* SEGMENTATION 2026-08-30: `signal` added, as a trailing optional parameter so
   no existing caller has to change.

   There was no cancellation at all before this. A superseded answer streamed to
   completion and was billed for in full; the genRef guard in generate() only
   discarded its tokens on the way in. With the aggregator now able to supersede
   more often — a held fragment that turns out to be one question, not two —
   paying for an answer nobody will ever see is no longer a rare case.

   HONEST LIMIT: this reliably stops OUR consumption and closes OUR connection.
   Whether OpenAI stops generating is unverified — /api/ai/chat passes
   upstream.body straight through, but fetchWithRetry in apps/web/lib/ai.js
   overwrites init.signal with its own timeout controller, so request.signal
   cannot currently be threaded to the provider. That is a server change and is
   deliberately not in this commit. */
// export async function askAIStream(transcript, onChunk, onDone, model) {
// export async function askAIStream(transcript, onChunk, onDone, model, sessionId) {
export async function askAIStream(transcript, onChunk, onDone, model, sessionId, signal) {
  const { webUrl, licenseKey } = await requireCredentials()
  if (!transcript?.length) throw new Error('Transcript is empty')

  /* PIPELINE 2026-08-31 ─ our own abort, bridged to the caller's ──────────────
     The deadline cannot ride on `signal` directly: that one belongs to the
     caller and means "superseded", which generate() deliberately swallows as a
     non-failure. A timeout that arrived as a bare AbortError would therefore
     produce a blank card with no message and no retry — the same class of bug
     by a different route.

     So the fetch gets OUR controller, the caller's signal is relayed into it,
     and `timedOut` records that the abort was ours. Bridged by hand rather than
     via AbortSignal.any, which this codebase has no other dependency on. */
  const guard = new AbortController()
  let timedOut = null

  const relay = () => guard.abort()
  if (signal) {
    if (signal.aborted) guard.abort()
    else signal.addEventListener('abort', relay, { once: true })
  }

  const startedAt = Date.now()
  const clock = { lastChunkAt: 0 }

  const watchdog = setInterval(() => {
    const at = Date.now()
    if (!clock.lastChunkAt) {
      if (at - startedAt >= FIRST_TOKEN_TIMEOUT_MS) timedOut = 'first_token'
    } else if (at - clock.lastChunkAt >= STALL_TIMEOUT_MS) {
      timedOut = 'stall'
    }
    if (!timedOut && at - startedAt >= TOTAL_TIMEOUT_MS) timedOut = 'total'
    if (timedOut) guard.abort()
  }, WATCHDOG_TICK_MS)

  try {
    const response = await fetch(`${webUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // signal,
      signal: guard.signal,
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
      // await pumpStream(response, onChunk)
      // await pumpStream(response, onChunk, signal)
      await pumpStream(response, onChunk, guard.signal, clock)
    } finally {
      if (onDone) onDone()
    }
  } catch (e) {
    // Ours, not the caller's — surface it as a real failure the overlay can show
    // and the user can retry, rather than as a silent supersede.
    if (timedOut) throw streamTimeout(timedOut)
    throw e
  } finally {
    clearInterval(watchdog)
    signal?.removeEventListener('abort', relay)
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
/* PIPELINE 2026-08-31: `signal` added as a trailing optional parameter, the same
   way it was added to askAIStream, so no existing caller has to change.

   This call had no timeout and no cancellation at all, and useVoice chains every
   segment onto one serial promise. A single never-settling upload therefore
   blocked EVERY later segment for the rest of the session — the chain's .catch
   handles a rejection, but nothing handles a promise that never settles. The
   segmented path went permanently mute with no error shown anywhere. */
// export async function transcribe(audioBlob, fileName = 'audio.webm') {
// export async function transcribe(audioBlob, fileName = 'audio.webm', sessionId) {
export async function transcribe(audioBlob, fileName = 'audio.webm', sessionId, signal) {
  const { webUrl, licenseKey } = await requireCredentials()

  const form = new FormData()
  form.append('licenseKey', licenseKey)
  form.append('sessionId', sessionId || '')
  form.append('file', audioBlob, fileName)

  const response = await fetch(`${webUrl}/api/ai/transcribe`, {
    method: 'POST',
    signal,
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
// PIPELINE 2026-08-31: `signal` added, trailing and optional. A hung SDP POST
// left useLiveVoice's run() awaiting forever with a PeerConnection open and no
// capture path running — a silent, permanent, unrecoverable dead session.
// export async function openRealtimeCall(sdp, sessionId) {
export async function openRealtimeCall(sdp, sessionId, signal) {
  const { webUrl, licenseKey } = await requireCredentials()

  const response = await fetch(`${webUrl}/api/ai/realtime`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
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
