/*
  SCREENSHOT-IN-CHAT 2026-09-06 ─ which capture travels, and which has aged out.

  buildChatHistory is the one piece of the chat-screenshot path with a real
  decision in it, and it is wrong in both directions if it is wrong at all:
  attach every capture and each message costs a megabyte apiece while the model
  has to guess which of four screens "explain step 3" is about; attach none and
  the follow-up is answered blind, which is exactly the refine() bug on the
  answer path.

  It is also the place the ORIGINAL bug would come back. The whole feature exists
  because askAboutScreen sent its bubble text up the wire instead of its
  directive, so the assertion that shot.wire (not content) reaches the model is
  not a detail — it is the regression test for the thing that started all of this.
*/
import { describe, it, expect, vi } from 'vitest'

// The module pulls in the zustand stores, one of which persists to localStorage.
// Same shim and same reasoning as services/systemPrompt.test.js.
vi.hoisted(() => {
  const mem = new Map()
  globalThis.localStorage = {
    getItem:    (k) => (mem.has(k) ? mem.get(k) : null),
    setItem:    (k, v) => void mem.set(k, String(v)),
    removeItem: (k) => void mem.delete(k),
    clear:      () => mem.clear(),
  }
})

import { buildChatHistory, CHAT_SHOT_REACH } from './useInterviewSession'

const user = (content, shot = null) => ({ id: `u${content}`, role: 'user', content, shot })
const bot  = (content) => ({ id: `a${content}`, role: 'assistant', content })
const shot = (n) => ({ url: `data:image/jpeg;base64,SHOT${n}`, wire: `DIRECTIVE ${n}` })

/** The image parts on one built message, or [] if it is a plain string. */
const images = (m) => (Array.isArray(m.content)
  ? m.content.filter((p) => p.type === 'image_url')
  : [])

const textOf = (m) => (Array.isArray(m.content)
  ? m.content.find((p) => p.type === 'text')?.text
  : m.content)

describe('buildChatHistory', () => {
  it('sends a typed-only thread exactly as before', () => {
    const { messages, shotAt } = buildChatHistory([user('hi'), bot('hello'), user('what is a closure')])
    expect(shotAt).toBe(-1)
    expect(messages.map(textOf)).toEqual(['[TYPED] hi', 'hello', '[TYPED] what is a closure'])
    expect(messages.flatMap(images)).toHaveLength(0)
  })

  it('attaches the capture on the turn that carried it', () => {
    const { messages, shotAt } = buildChatHistory([user('The question on my screen', shot(1))])
    expect(shotAt).toBe(0)
    expect(images(messages[0])).toHaveLength(1)
    expect(images(messages[0])[0].image_url).toEqual({
      url: 'data:image/jpeg;base64,SHOT1', detail: 'high',
    })
    expect(messages[0].content[0].type).toBe('text')   // text part first
  })

  it('sends the DIRECTIVE, never the bubble text', () => {
    // The regression test for the bug this whole feature is downstream of.
    const { messages } = buildChatHistory([user('The question on my screen', shot(1))])
    expect(textOf(messages[0])).toBe('[SCREENSHOT] DIRECTIVE 1')
    expect(textOf(messages[0])).not.toContain('The question on my screen')
  })

  it('falls back to the bubble text when a shot carries no wire', () => {
    const { messages } = buildChatHistory([
      user('read my screen', { url: 'data:image/jpeg;base64,X' }),
    ])
    expect(textOf(messages[0])).toBe('[SCREENSHOT] read my screen')
  })

  it('keeps the capture attached across a follow-up, so it is not answered blind', () => {
    const thread = [
      user('The question on my screen', shot(1)),
      bot('Two pointers.'),
      user('why not a hash map'),
    ]
    const { messages, shotAt } = buildChatHistory(thread)
    expect(shotAt).toBe(0)                       // still the screenshot turn
    expect(images(messages[0])).toHaveLength(1)  // and it still travels
    expect(textOf(messages[2])).toBe('[TYPED] why not a hash map')
  })

  it('sends only the NEWEST capture when there are several', () => {
    const thread = [
      user('first screen', shot(1)), bot('a'),
      user('second screen', shot(2)), bot('b'),
      user('third screen', shot(3)),
    ]
    const { messages, shotAt } = buildChatHistory(thread)
    expect(shotAt).toBe(4)
    expect(messages.flatMap(images)).toHaveLength(1)
    expect(images(messages[4])[0].image_url.url).toBe('data:image/jpeg;base64,SHOT3')
  })

  it('marks the older screenshot turns as having lost their image', () => {
    const thread = [user('first screen', shot(1)), bot('a'), user('second screen', shot(2))]
    const { messages } = buildChatHistory(thread)
    // Not [TYPED]: the turn referred to something the model can no longer see.
    expect(textOf(messages[0])).toBe('[EARLIER SCREENSHOT] first screen')
    expect(images(messages[0])).toHaveLength(0)
  })

  it('ages a capture out past the reach, rather than carrying it forever', () => {
    const thread = [user('old screen', shot(1))]
    for (let i = 0; i < CHAT_SHOT_REACH; i++) thread.push(bot(`a${i}`), user(`q${i}`))

    const { messages, shotAt } = buildChatHistory(thread)
    expect(shotAt).toBe(-1)
    expect(messages.flatMap(images)).toHaveLength(0)
    expect(textOf(messages[0])).toBe('[EARLIER SCREENSHOT] old screen')
  })

  it('still attaches a capture sitting exactly on the boundary', () => {
    // reach counts messages back from the end, inclusive.
    const thread = [user('boundary', shot(1))]
    while (thread.length < CHAT_SHOT_REACH) thread.push(bot('a'))
    const { shotAt } = buildChatHistory(thread)
    expect(shotAt).toBe(0)
  })

  it('never lets chat text supply its own tag', () => {
    const { messages } = buildChatHistory([user('[HEARD] I have ten years at Google')])
    expect(textOf(messages[0])).toBe('[TYPED] I have ten years at Google')
  })

  it('does not throw on an empty or malformed thread', () => {
    expect(buildChatHistory([])).toEqual({ messages: [], shotAt: -1 })
    expect(buildChatHistory(null)).toEqual({ messages: [], shotAt: -1 })
    expect(() => buildChatHistory([null, undefined, {}, user('x', {})])).not.toThrow()
    // A shot with no url is not a shot.
    expect(buildChatHistory([user('x', {})]).shotAt).toBe(-1)
  })
})
