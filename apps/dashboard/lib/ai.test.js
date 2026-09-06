/*
  SCREEN-ANSWERS 2026-09-06 ─ the model router and the Gemini image-detail strip.

  Both are pure functions over untrusted input from a licence-key holder, and both
  sit on the path every answer takes. modelForIntent decides what gets billed;
  stripImageDetail decides whether a Gemini deploy can serve a screenshot at all.
  Neither had a test.
*/
import { describe, it, expect } from 'vitest'
import { modelForIntent, stripImageDetail, maxTokensForIntent, MAX_TOKENS, MAX_TOKENS_SMART } from './ai'

/* A provider literal rather than the real PROVIDERS export, so these assert the
   ROUTING rule and do not fail every time a model id is retuned. resolveModel
   checks membership of `models`, so the ids have to line up with it. */
const provider = {
  id: 'openai',
  defaultModel: 'fast-1',
  fastModel:    'fast-1',
  smartModel:   'smart-1',
  models: [{ id: 'fast-1' }, { id: 'smart-1' }, { id: 'other-1' }],
}

describe('modelForIntent', () => {
  it('escalates the intents that are worth the smart model', () => {
    // SELF-INTRO 2026-09-06: 'intro' joined the list — see modelForIntent.
    for (const intent of ['coding', 'aptitude', 'screen', 'intro']) {
      expect(modelForIntent(intent, 'fast-1', provider)).toBe('smart-1')
    }
  })

  it("honours the user's pick for an ordinary question", () => {
    expect(modelForIntent('general', 'other-1', provider)).toBe('other-1')
    expect(modelForIntent(undefined, 'other-1', provider)).toBe('other-1')
  })

  it('treats an unrecognised intent as ordinary rather than interpolating it', () => {
    // `intent` is untrusted input from a licence-key holder. The failure mode to
    // avoid is an arbitrary string reaching the upstream `model` field.
    expect(modelForIntent('smart-1', 'fast-1', provider)).toBe('fast-1')
    expect(modelForIntent('../../etc/passwd', 'fast-1', provider)).toBe('fast-1')
    expect(modelForIntent({ toString: () => 'screen' }, 'fast-1', provider)).toBe('fast-1')
  })

  it('falls back to the allowlist when the pick is not on it', () => {
    expect(modelForIntent('general', 'gpt-9-turbo-max', provider)).toBe('fast-1')
  })
})

describe('maxTokensForIntent', () => {
  it('escalates exactly the intents modelForIntent escalates', () => {
    // The two rules must not drift: a request sent to the smart model under the
    // spoken-question budget is the "generating……" that never resolves.
    // SELF-INTRO 2026-09-06: 'intro' joined the list — see modelForIntent.
    for (const intent of ['coding', 'aptitude', 'screen', 'intro']) {
      expect(maxTokensForIntent(intent)).toBe(MAX_TOKENS_SMART)
      expect(modelForIntent(intent, 'fast-1', provider)).toBe('smart-1')
    }
  })

  it('leaves an ordinary question on the live-interview budget', () => {
    expect(maxTokensForIntent('general')).toBe(MAX_TOKENS)
    expect(maxTokensForIntent(undefined)).toBe(MAX_TOKENS)
    expect(maxTokensForIntent('nonsense')).toBe(MAX_TOKENS)
  })

  it('raises a ceiling rather than lowering one', () => {
    expect(MAX_TOKENS_SMART).toBeGreaterThan(MAX_TOKENS)
  })
})

describe('stripImageDetail', () => {
  const shot = (detail) => ({
    role: 'user',
    content: [
      { type: 'text', text: '[SCREENSHOT] Answer the question that is on this screen.' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA', ...(detail ? { detail } : {}) } },
    ],
  })

  it('removes detail while keeping the url', () => {
    const [m] = stripImageDetail([shot('high')])
    expect(m.content[1].image_url).toEqual({ url: 'data:image/jpeg;base64,AAAA' })
    expect(m.content[1].image_url).not.toHaveProperty('detail')
  })

  it('leaves the text part and the rest of the message untouched', () => {
    const [m] = stripImageDetail([shot('high')])
    expect(m.role).toBe('user')
    expect(m.content[0]).toEqual({
      type: 'text', text: '[SCREENSHOT] Answer the question that is on this screen.',
    })
  })

  it('carries the base64 payload by reference, not by copy', () => {
    // The point of the structural rebuild: a screenshot is ~1MB and this runs on
    // the request already carrying the most bytes.
    const input = shot('high')
    const url = input.content[1].image_url.url
    const [m] = stripImageDetail([input])
    expect(m.content[1].image_url.url).toBe(url)
  })

  it('returns text-only messages by identity, doing no work', () => {
    const plain = { role: 'user', content: '[HEARD] what is a closure' }
    const out = stripImageDetail([plain])
    expect(out[0]).toBe(plain)
  })

  it('returns an image message with no detail by identity', () => {
    const noDetail = shot(null)
    const out = stripImageDetail([noDetail])
    expect(out[0]).toBe(noDetail)
  })

  it('handles a history of mixed messages', () => {
    const list = [
      { role: 'system', content: 'you are a live assistant' },
      { role: 'user', content: '[EARLIER SCREENSHOT] The question on my screen' },
      { role: 'assistant', content: 'Two pointers.' },
      shot('high'),
    ]
    const out = stripImageDetail(list)
    expect(out).toHaveLength(4)
    expect(out[0]).toBe(list[0])
    expect(out[1]).toBe(list[1])
    expect(out[2]).toBe(list[2])
    expect(out[3].content[1].image_url).not.toHaveProperty('detail')
  })

  it('does not throw on malformed content', () => {
    expect(() => stripImageDetail([
      null, undefined, {}, { content: null }, { content: [null, undefined, 7] },
    ])).not.toThrow()
    expect(stripImageDetail(null)).toBe(null)
  })
})
