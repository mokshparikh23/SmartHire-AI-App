import { describe, it, expect } from 'vitest'
import { nextParamFor, safeNext } from './next-url.js'

/*
  safeNext() is the open-redirect guard on `?next=`, and since the marketing
  split the parameter is attacker-supplyable from a page on another origin: the
  site deep-links into the app, proxy.js carries the destination through /login,
  and signup carries it through the confirmation email.

  It is imported by four call sites — the auth callback, both proxies and both
  requireUser()s — and had no test. The three attacks in its header are the first
  three cases below.
*/

describe('safeNext', () => {
  it('accepts an ordinary same-origin path', () => {
    expect(safeNext('/dashboard')).toBe('/dashboard')
    expect(safeNext('/dashboard/billing?plan=credit_6')).toBe('/dashboard/billing?plan=credit_6')
    expect(safeNext('/')).toBe('/')
    expect(safeNext('/a/b/c#frag')).toBe('/a/b/c#frag')
  })

  it('rejects userinfo, which reads as our host and is not', () => {
    // next=@evil.com -> https://app.smarthire.ai@evil.com
    // Everything before the @ is userinfo. The host is evil.com.
    expect(safeNext('@evil.com')).toBeNull()
    expect(safeNext('@evil.com/path')).toBeNull()
  })

  it('rejects a protocol-relative URL', () => {
    // Harmless while the origin is prepended, and a live open redirect the moment
    // anyone builds a redirect without it — which is one refactor away.
    expect(safeNext('//evil.com')).toBeNull()
    expect(safeNext('//evil.com/path')).toBeNull()
  })

  it('rejects a backslash in the authority position', () => {
    // Browsers normalise a backslash to a forward slash there.
    expect(safeNext('\\evil.com')).toBeNull()
    expect(safeNext('/\\evil.com')).toBeNull()
    expect(safeNext('\\\\evil.com')).toBeNull()
  })

  it('rejects anything carrying a scheme', () => {
    for (const value of [
      'https://evil.com',
      'http://evil.com',
      'javascript:alert(1)',
      'data:text/html,<script>',
      'mailto:a@b.c',
    ]) {
      expect(safeNext(value), value).toBeNull()
    }
  })

  it('rejects a bare word, which would resolve relative to the current page', () => {
    expect(safeNext('dashboard')).toBeNull()
    expect(safeNext('evil.com')).toBeNull()
  })

  it('rejects an empty or whitespace-led value', () => {
    expect(safeNext('')).toBeNull()
    expect(safeNext(' /dashboard')).toBeNull()
    expect(safeNext('\t//evil.com')).toBeNull()
    expect(safeNext('\n/dashboard')).toBeNull()
  })

  it('rejects anything that is not a string', () => {
    for (const value of [null, undefined, 0, 1, {}, [], ['/dashboard'], true, NaN]) {
      expect(safeNext(value), String(value)).toBeNull()
    }
  })

  it('is a whitelist, so an unfamiliar shape fails closed', () => {
    // The rule is "one leading slash, and the next character is neither a slash
    // nor a backslash" — not a list of bad patterns to dodge.
    for (const value of ['#frag', '?a=b', '../up', './here', ';/x', '%2f%2fevil.com']) {
      expect(safeNext(value), value).toBeNull()
    }
  })

  it('leaves an encoded path alone rather than decoding it into an authority', () => {
    // Decoding here would turn a safe path into //evil.com. It must not.
    expect(safeNext('/%2f%2fevil.com')).toBe('/%2f%2fevil.com')
  })

  it('returns the value unchanged when it passes, never a rewritten one', () => {
    const value = '/dashboard/billing?plan=credit_6&x=1#top'
    expect(safeNext(value)).toBe(value)
  })
})

describe('nextParamFor', () => {
  it('joins a path and its query the way `next` expects', () => {
    expect(nextParamFor('/dashboard/billing', '?plan=credit_6')).toBe('/dashboard/billing?plan=credit_6')
  })

  it('handles an empty search, which is how a bare path arrives', () => {
    expect(nextParamFor('/dashboard')).toBe('/dashboard')
    expect(nextParamFor('/dashboard', '')).toBe('/dashboard')
  })

  it('produces something safeNext accepts, which is the whole point of the pair', () => {
    for (const [path, search] of [['/dashboard', ''], ['/dashboard/usage', '?tab=all']]) {
      expect(safeNext(nextParamFor(path, search))).toBe(`${path}${search}`)
    }
  })
})
