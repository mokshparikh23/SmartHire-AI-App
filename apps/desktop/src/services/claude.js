import { buildSystemPrompt } from './systemPrompt'

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-opus-4-5'
const MAX_TOKENS = 1024

/**
 * Sends transcript to Claude and returns AI answer.
 * @param {Array} transcript - Array of { role: 'user'|'assistant', content: string }
 * @returns {Promise<string>} - AI response text
 */
export async function askClaude(transcript) {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY

  if (!apiKey) {
    throw new Error('VITE_CLAUDE_API_KEY is not set in your .env file')
  }

  if (!transcript || transcript.length === 0) {
    throw new Error('Transcript is empty')
  }

  let response
  try {
    response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(),
        messages: transcript,
      }),
    })
  } catch (networkErr) {
    throw new Error(`Network error calling Claude API: ${networkErr.message}`)
  }

  if (!response.ok) {
    let errBody = ''
    try { errBody = await response.text() } catch (_) {}
    throw new Error(`Claude API error ${response.status}: ${errBody}`)
  }

  const data = await response.json()

  // Handle API-level errors returned in response body
  if (data.type === 'error') {
    throw new Error(`Claude API returned error: ${data.error?.message}`)
  }

  const text = data?.content?.[0]?.text
  if (!text) {
    throw new Error('Claude returned an empty response')
  }

  return text
}

/**
 * Streaming version — calls onChunk(text) as tokens arrive.
 * @param {Array} transcript
 * @param {Function} onChunk - called with each streamed text chunk
 * @param {Function} onDone - called when stream is complete
 */
export async function askClaudeStream(transcript, onChunk, onDone) {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY

  if (!apiKey) throw new Error('VITE_CLAUDE_API_KEY is not set in your .env file')

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(),
      stream: true,
      messages: transcript,
    }),
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Claude API error ${response.status}: ${errBody}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const jsonStr = line.slice(6).trim()
      if (jsonStr === '[DONE]') continue
      try {
        const parsed = JSON.parse(jsonStr)
        if (parsed.type === 'content_block_delta') {
          const chunk = parsed.delta?.text
          if (chunk) onChunk(chunk)
        }
      } catch (_) {
        // skip malformed SSE lines
      }
    }
  }

  if (onDone) onDone()
}