import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GATEWAY_LABEL, gatewayFor, razorpayLive } from './gateway.js'

/*
  These read process.env at call time, not at import time, so each test can set
  the environment it is describing. Restored afterwards so ordering cannot
  matter.
*/
const KEYS = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_LIVE']
let saved

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  for (const k of KEYS) delete process.env[k]
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('razorpayLive', () => {
  it('answers from the keys on the deployment that holds them', () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x'
    process.env.RAZORPAY_KEY_SECRET = 'secret'
    expect(razorpayLive()).toBe(true)
  })

  it('needs BOTH keys, not one', () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x'
    expect(razorpayLive()).toBe(false)

    delete process.env.RAZORPAY_KEY_ID
    process.env.RAZORPAY_KEY_SECRET = 'secret'
    expect(razorpayLive()).toBe(false)
  })

  it('answers from a plain flag on the deployment that must hold no keys', () => {
    // This is the whole reason the function has two arms: apps/marketing renders
    // /compare and must not carry a payment secret to do it.
    process.env.RAZORPAY_LIVE = 'true'
    expect(razorpayLive()).toBe(true)
  })

  it('treats the flag as the exact string "true" and nothing else', () => {
    for (const value of ['1', 'yes', 'TRUE', 'True', '']) {
      process.env.RAZORPAY_LIVE = value
      expect(razorpayLive(), `RAZORPAY_LIVE=${JSON.stringify(value)}`).toBe(false)
    }
  })

  it('is false on a deployment with neither', () => {
    expect(razorpayLive()).toBe(false)
  })
})

describe('gatewayFor', () => {
  it('sends INR to Razorpay once it is live', () => {
    process.env.RAZORPAY_LIVE = 'true'
    expect(gatewayFor('INR')).toBe('razorpay')
  })

  it('falls INR back to Stripe until Razorpay is switched on', () => {
    // The documented kindness: "an Indian buyer falls back to Stripe rather than
    // meeting an error — which is what lets this ship before the Razorpay
    // account is live". A buyer who can still pay by card beats one who cannot
    // pay at all.
    expect(gatewayFor('INR')).toBe('stripe')
  })

  it('never sends a non-INR currency to Razorpay, even with it live', () => {
    process.env.RAZORPAY_LIVE = 'true'
    expect(gatewayFor('USD')).toBe('stripe')
    expect(gatewayFor('GBP')).toBe('stripe')
    expect(gatewayFor(undefined)).toBe('stripe')
  })

  /*
    THE SECURITY PROPERTY, AS A TEST. The note says the gateway is "DERIVED FROM
    CURRENCY, NEVER FROM THE CLIENT ... a client that cannot name its currency
    cannot name its gateway either. If it could, it could pick the one whose
    price table is cheaper."

    One parameter, and it is the currency. That is the shape the claim rests on.
  */
  it('takes the currency and nothing else', () => {
    expect(gatewayFor.length).toBe(1)
  })

  it('only ever returns a gateway that has a label', () => {
    process.env.RAZORPAY_LIVE = 'true'
    for (const currency of ['INR', 'USD', 'GBP', null]) {
      expect(GATEWAY_LABEL[gatewayFor(currency)]).toBeTypeOf('string')
    }
  })
})
