import { describe, it, expect } from 'vitest'
import {
  ALL_CREDIT_PACKS,
  CREDIT_PACKS,
  DEFAULT_CURRENCY,
  PACK_BY_ID,
  PRICE_TABLE,
  SINGLE_CREDIT_PACK,
  SUBSCRIPTION_DAYS,
  SUBSCRIPTION_TIERS,
  formatMoney,
  formatPerCredit,
  priceOf,
  resolveCountry,
  resolveCurrency,
  resolvePack,
  resolveTier,
} from './index.js'

/** A minimal stand-in for the Headers object next/headers hands these. */
const headers = (map = {}) => ({ get: (name) => map[name] ?? null })
const nfGeo = (value) => Buffer.from(JSON.stringify(value)).toString('base64')

describe('resolveCountry', () => {
  it('reads Netlify x-nf-geo, which is base64 JSON', () => {
    expect(resolveCountry(headers({ 'x-nf-geo': nfGeo({ country: { code: 'IN' } }) }))).toBe('IN')
  })

  it('uppercases whatever the header said', () => {
    expect(resolveCountry(headers({ 'x-nf-geo': nfGeo({ country: { code: 'in' } }) }))).toBe('IN')
    expect(resolveCountry(headers({ 'cf-ipcountry': 'de' }))).toBe('DE')
  })

  it('falls through a malformed x-nf-geo instead of throwing', () => {
    // The comment on this branch says a bad header is not worth failing a page
    // render over, so the fallbacks below it must still be reached.
    const h = headers({ 'x-nf-geo': 'not-base64-json', 'x-vercel-ip-country': 'FR' })
    expect(resolveCountry(h)).toBe('FR')
  })

  it('ignores a country code that is not two characters', () => {
    expect(resolveCountry(headers({ 'x-nf-geo': nfGeo({ country: { code: 'IND' } }) }))).toBeNull()
    expect(resolveCountry(headers({ 'cf-ipcountry': 'XYZ' }))).toBeNull()
  })

  it('prefers x-vercel-ip-country over cf-ipcountry', () => {
    // Precedence is load-bearing: the note on resolveCurrency warns that one app
    // proxied through Cloudflare and one not means Vercel geolocating
    // Cloudflare's edge IP and winning this order with it.
    const h = headers({ 'x-vercel-ip-country': 'US', 'cf-ipcountry': 'IN' })
    expect(resolveCountry(h)).toBe('US')
  })

  it('prefers x-nf-geo over every plain header', () => {
    const h = headers({
      'x-nf-geo': nfGeo({ country: { code: 'IN' } }),
      'x-vercel-ip-country': 'US',
    })
    expect(resolveCountry(h)).toBe('IN')
  })

  it('returns null when the request carries no geo at all, as in local dev', () => {
    expect(resolveCountry(headers())).toBeNull()
    expect(resolveCountry(undefined)).toBeNull()
    expect(resolveCountry({})).toBeNull()
  })
})

describe('resolveCurrency', () => {
  it('charges India in INR and everywhere else in USD', () => {
    expect(resolveCurrency(headers({ 'cf-ipcountry': 'IN' }))).toBe('INR')
    expect(resolveCurrency(headers({ 'cf-ipcountry': 'US' }))).toBe('USD')
    expect(resolveCurrency(headers({ 'cf-ipcountry': 'GB' }))).toBe('USD')
  })

  it('falls back to the default when there is no geo', () => {
    expect(resolveCurrency(headers())).toBe(DEFAULT_CURRENCY)
  })

  /*
    THE SECURITY NOTE ON THIS FUNCTION, AS A TEST. It reads: "currency is
    resolved from request headers and NEVER from the request body. If the client
    could name its own currency, anyone would post currency: 'INR' and pay the
    Indian price."

    resolveCurrency takes exactly one argument and it is the headers, so a body
    cannot reach it by construction. What this pins is that it stays that way —
    an added second parameter, or a read of anything but a header, breaks it.
  */
  it('takes headers and nothing else — a body cannot name a currency', () => {
    expect(resolveCurrency.length).toBe(1)

    const seen = []
    const spy = { get: (name) => { seen.push(name); return null } }
    resolveCurrency(spy)

    // Only geo headers were consulted, and nothing that a client controls.
    expect(seen).toEqual(['x-nf-geo', 'x-country', 'x-vercel-ip-country', 'cf-ipcountry'])
  })

  it('cannot be talked into a currency that has no price table', () => {
    // Even if a country mapping were added pointing at a currency with no table,
    // the guard `PRICE_TABLE[currency] ? currency : DEFAULT_CURRENCY` holds.
    expect(Object.keys(PRICE_TABLE)).toContain(resolveCurrency(headers({ 'cf-ipcountry': 'IN' })))
  })
})

describe('the price table', () => {
  /*
    The highest-value test in this file. Every id that can be rendered or bought
    must have a price in EVERY currency: a missing one makes priceOf() return
    null, formatMoney(null) render as the currency symbol and zero, and a
    checkout charge nothing. Adding a pack and forgetting a currency is a
    one-line mistake that this catches and a human review does not.
  */
  const everyId = [...ALL_CREDIT_PACKS, ...SUBSCRIPTION_TIERS].map((p) => p.id)

  for (const currency of Object.keys(PRICE_TABLE)) {
    it(`prices every pack and tier in ${currency}`, () => {
      for (const id of everyId) {
        const amount = priceOf(id, currency)
        expect(amount, `${id} has no ${currency} price`).toBeTypeOf('number')
        expect(amount, `${id} is not a positive ${currency} amount`).toBeGreaterThan(0)
      }
    })

    it(`keeps every ${currency} amount an integer in the minor unit`, () => {
      // "float money is how rounding bugs start", and Stripe charges integers.
      for (const id of everyId) {
        expect(Number.isInteger(priceOf(id, currency)), `${id} is fractional`).toBe(true)
      }
    })
  }

  it('has no price for an id nobody sells', () => {
    expect(priceOf('credit_999', 'USD')).toBeNull()
    expect(priceOf(undefined, 'USD')).toBeNull()
  })

  it('prices an unknown currency from the default table rather than failing', () => {
    expect(priceOf('credit_3', 'GBP')).toBe(PRICE_TABLE[DEFAULT_CURRENCY].credit_3)
  })

  it('indexes every pack and tier in PACK_BY_ID', () => {
    for (const id of everyId) expect(PACK_BY_ID[id]?.id).toBe(id)
  })

  it('gets cheaper per credit as the pack gets bigger', () => {
    // The ladder is the reason the bonus exists — "that discount is the reason
    // to buy up". If an edit ever makes a bigger pack worse value, say so.
    for (const currency of Object.keys(PRICE_TABLE)) {
      const rates = [SINGLE_CREDIT_PACK, ...CREDIT_PACKS].map((p) => {
        const { amountMinor, totalCredits } = resolvePack(p, currency)
        return { id: p.id, rate: amountMinor / totalCredits }
      })
      for (let i = 1; i < rates.length; i++) {
        expect(rates[i].rate, `${rates[i].id} is not better value than ${rates[i - 1].id} in ${currency}`)
          .toBeLessThan(rates[i - 1].rate)
      }
    }
  })

  it('makes the single credit the worst rate, which is its whole job', () => {
    for (const currency of Object.keys(PRICE_TABLE)) {
      const single = resolvePack(SINGLE_CREDIT_PACK, currency)
      const singleRate = single.amountMinor / single.totalCredits
      for (const pack of CREDIT_PACKS) {
        const p = resolvePack(pack, currency)
        expect(p.amountMinor / p.totalCredits).toBeLessThan(singleRate)
      }
    }
  })
})

describe('resolvePack', () => {
  it('counts the bonus into totalCredits', () => {
    // "A '6 credits +2 free' pack delivers 8 hours."
    const six = resolvePack({ id: 'credit_6', credits: 6, bonus: 2 }, 'INR')
    expect(six.totalCredits).toBe(8)
  })

  it('divides the per-credit figure by the total, bonus included', () => {
    const six = resolvePack({ id: 'credit_6', credits: 6, bonus: 2 }, 'INR')
    // ₹7,380 over 8 credits is ₹922.50 — the figure written in the price table.
    expect(six.perCredit).toContain('922.50')
  })

  it('carries the currency it was resolved for', () => {
    expect(resolvePack(SINGLE_CREDIT_PACK, 'INR').currency).toBe('INR')
    expect(resolvePack(SINGLE_CREDIT_PACK, 'USD').currency).toBe('USD')
  })
})

describe('resolveTier', () => {
  const tier = (kind) => SUBSCRIPTION_TIERS.find((t) => t.kind === kind)

  it('converts a weekly price to a monthly equivalent at 52/12', () => {
    const weekly = resolveTier(tier('weekly'), 'INR')
    const expected = Math.round(PRICE_TABLE.INR.sub_weekly * 52 / 12)
    expect(weekly.perMonth).toBe(formatMoney(expected, 'INR'))
    expect(weekly.perMonthApprox).toBe(true)
  })

  it('divides a yearly price by twelve', () => {
    const yearly = resolveTier(tier('yearly'), 'INR')
    expect(yearly.perMonth).toBe(formatMoney(Math.round(PRICE_TABLE.INR.sub_yearly / 12), 'INR'))
    expect(yearly.perMonthApprox).toBe(false)
  })

  it('gives the monthly tier no monthly-equivalent line, because it is one', () => {
    expect(resolveTier(tier('monthly'), 'INR').perMonth).toBeNull()
  })

  it('makes yearly cheaper per month than monthly, which is what "Best value" claims', () => {
    for (const currency of Object.keys(PRICE_TABLE)) {
      const t = PRICE_TABLE[currency]
      expect(Math.round(t.sub_yearly / 12)).toBeLessThan(t.sub_monthly)
    }
  })
})

describe('formatMoney', () => {
  it('renders whole units with no fractional part', () => {
    expect(formatMoney(738000, 'INR')).toBe('₹7,380')
    expect(formatMoney(8900, 'USD')).toBe('$89')
  })

  it('renders a missing amount as zero rather than NaN', () => {
    // priceOf() returns null for an unknown id, and this is what the page shows
    // if that ever reaches it.
    expect(formatMoney(null, 'USD')).toBe('$0')
    expect(formatMoney(undefined, 'INR')).toBe('₹0')
  })
})

describe('formatPerCredit', () => {
  it('always shows two decimal places, where the discount is visible', () => {
    expect(formatPerCredit(369000, 3, 'INR')).toBe('₹1,230.00')
  })

  it('never divides by zero', () => {
    expect(formatPerCredit(2900, 0, 'USD')).toBe('$29.00')
  })
})

describe('SUBSCRIPTION_DAYS', () => {
  it('has a period length for every subscription kind that is sold', () => {
    for (const t of SUBSCRIPTION_TIERS) {
      expect(SUBSCRIPTION_DAYS[t.kind], `no period length for ${t.kind}`).toBeGreaterThan(0)
    }
  })
})
