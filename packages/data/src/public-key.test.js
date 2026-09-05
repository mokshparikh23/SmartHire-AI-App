import { describe, it, expect } from 'vitest'
import { isSecretKey, assertPublishableKey } from './public-key.js'

/*
  KEY-SHAPE 2026-09-06. The case that matters is the one that actually happened:
  a `sb_secret_…` value sitting in NEXT_PUBLIC_SUPABASE_ANON_KEY. The rest of
  these exist to hold the line the module states — that it recognises SECRETS and
  never tries to certify a key as publishable, so an unfamiliar format is not a
  build failure.
*/

/** Minimal unsigned JWT; only the payload is ever read. */
const jwt = (payload) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`
}

describe('isSecretKey', () => {
  /*
    Every key in this file is invented. The first draft used the real value from
    the 2026-09-06 incident as the fixture, and GitHub push protection rejected
    the push — correctly: a test that pins a live secret writes it into the git
    history permanently, which is strictly worse than the bundle it was meant to
    describe. Shape is the only thing under test, so shape is all a fixture needs.
  */
  it('catches the current secret prefix', () => {
    expect(isSecretKey('sb_secret_EXAMPLE_NOT_A_REAL_KEY_000')).toBe(true)
  })

  it('catches a legacy service_role JWT', () => {
    expect(isSecretKey(jwt({ role: 'service_role', iss: 'supabase' }))).toBe(true)
  })

  it('passes the publishable prefix', () => {
    expect(isSecretKey('sb_publishable_abc123')).toBe(false)
  })

  it('passes a legacy anon JWT', () => {
    expect(isSecretKey(jwt({ role: 'anon', iss: 'supabase' }))).toBe(false)
  })

  it('says nothing about shapes it does not recognise', () => {
    // A future key format must fail closed towards "not a secret", or every
    // deployment breaks the day Supabase ships one.
    expect(isSecretKey('sb_something_new_2027')).toBe(false)
    expect(isSecretKey('not.a.jwt')).toBe(false)
  })

  it('is not fooled by a non-string', () => {
    expect(isSecretKey(undefined)).toBe(false)
    expect(isSecretKey(null)).toBe(false)
    expect(isSecretKey('')).toBe(false)
  })
})

describe('assertPublishableKey', () => {
  it('throws on a secret key, and names the variable to fix', () => {
    expect(() => assertPublishableKey('sb_secret_abc'))
      .toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY holds a SECRET key/)
  })

  it('tells the caller to rotate, because deployment may already have happened', () => {
    expect(() => assertPublishableKey('sb_secret_abc')).toThrow(/rotate it/)
  })

  it('throws when the key is missing at all', () => {
    expect(() => assertPublishableKey('')).toThrow(/is not set/)
    expect(() => assertPublishableKey(undefined)).toThrow(/is not set/)
  })

  it('uses the variable name it was given', () => {
    expect(() => assertPublishableKey('sb_secret_abc', 'NEXT_PUBLIC_OTHER'))
      .toThrow(/NEXT_PUBLIC_OTHER/)
  })

  it('returns a publishable key unchanged, so it can wrap the argument', () => {
    expect(assertPublishableKey('sb_publishable_abc')).toBe('sb_publishable_abc')
  })
})
