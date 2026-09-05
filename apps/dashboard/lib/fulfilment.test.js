import { describe, it, expect, beforeEach, vi } from 'vitest'

/*
  THE MOST EXPENSIVE BUG THIS REPO CAN HAVE IS HERE. Both gateways retry
  aggressively and will redeliver an event days later; crediting an account twice
  shows up as free money, and it shows up quietly.

  The mechanism is a conditional update — status flips out of `pending` only if
  the row is still pending — and the tests below are about that mechanism rather
  than about the SQL: which columns the update filters on, and what the caller
  does when the claim comes back empty.
*/

const grantMinutes = vi.fn()
const ensureLicense = vi.fn()

vi.mock('@smarthire/data/metering', () => ({ grantMinutes: (...a) => grantMinutes(...a) }))
vi.mock('@smarthire/data/license', () => ({ ensureLicense: (...a) => ensureLicense(...a) }))
vi.mock('@smarthire/data/credits', () => ({ MINUTES_PER_CREDIT: 60 }))

const { claimOrder, fulfilCreditOrder, isoFromUnix } = await import('./fulfilment.js')

/**
 * Records every call made against the query builder so the test can assert the
 * shape of the statement, and resolves maybeSingle() with whatever the case set.
 */
function admin (claimResult) {
  const calls = { update: null, eq: [], table: null }
  const builder = {
    update (patch) { calls.update = patch; return builder },
    eq (column, value) { calls.eq.push([column, value]); return builder },
    select () { return builder },
    maybeSingle: async () => ({ data: claimResult }),
  }
  return {
    calls,
    from (table) { calls.table = table; return builder },
  }
}

const order = {
  id: 'order-1',
  user_id: 'user-1',
  credits: 6,
  bonus_credits: 2,
  pack_id: 'credit_6',
}

beforeEach(() => {
  grantMinutes.mockReset().mockResolvedValue({ ok: true })
  ensureLicense.mockReset().mockResolvedValue({ status: 'active' })
})

describe('claimOrder', () => {
  it('flips to paid only while the row is still pending', async () => {
    const db = admin({ id: 'order-1' })
    await claimOrder(db, 'order-1')

    expect(db.calls.table).toBe('credit_orders')
    expect(db.calls.update).toMatchObject({ status: 'paid' })
    // Both filters in one statement: the id narrows the search, and the pending
    // check IS the lock. There is no select-then-update, because the gap between
    // those two is exactly where a double grant lives.
    expect(db.calls.eq).toEqual([['id', 'order-1'], ['status', 'pending']])
  })

  it('stamps paid_at in the same statement as the status', async () => {
    const db = admin({ id: 'order-1' })
    await claimOrder(db, 'order-1')
    expect(Date.parse(db.calls.update.paid_at)).not.toBeNaN()
  })

  it('writes the caller\'s patch in that one statement too', async () => {
    // So a gateway id and the status flip cannot end up half-applied.
    const db = admin({ id: 'order-1' })
    await claimOrder(db, 'order-1', { stripe_payment_intent_id: 'pi_1' })
    expect(db.calls.update).toMatchObject({ status: 'paid', stripe_payment_intent_id: 'pi_1' })
  })

  it('returns null when the update matched nothing', async () => {
    await expect(claimOrder(admin(null), 'order-1')).resolves.toBeNull()
    await expect(claimOrder(admin(undefined), 'order-1')).resolves.toBeNull()
  })
})

describe('fulfilCreditOrder', () => {
  it('grants the paid credits and the bonus as two separate ledger rows', async () => {
    // "so a customer can see what they paid for and what they were given, rather
    // than one opaque number"
    const result = await fulfilCreditOrder(admin({ id: 'order-1' }), order)

    expect(result).toEqual({ granted: true, credits: 8 })
    expect(grantMinutes).toHaveBeenCalledTimes(2)

    expect(grantMinutes).toHaveBeenNthCalledWith(1, expect.objectContaining({
      userId: 'user-1', minutes: 360, kind: 'purchase', orderId: 'order-1',
    }))
    expect(grantMinutes).toHaveBeenNthCalledWith(2, expect.objectContaining({
      userId: 'user-1', minutes: 120, kind: 'purchase_bonus', orderId: 'order-1',
    }))
  })

  /*
    THE REDELIVERY TEST. This is the one that matters: a second delivery of the
    same event must move no money at all.
  */
  it('grants nothing at all on a redelivery', async () => {
    const result = await fulfilCreditOrder(admin(null), order)

    expect(result).toEqual({ granted: false, reason: 'already fulfilled' })
    expect(grantMinutes).not.toHaveBeenCalled()
    expect(ensureLicense).not.toHaveBeenCalled()
  })

  it('claims before it grants, so a lost claim cannot leak credits', async () => {
    const order_ = []
    const db = admin(null)
    const original = db.from
    db.from = (t) => { order_.push('claim'); return original(t) }
    grantMinutes.mockImplementation(() => { order_.push('grant'); return Promise.resolve() })

    await fulfilCreditOrder(db, order)
    expect(order_).toEqual(['claim'])
  })

  it('writes no bonus row when there is no bonus', async () => {
    await fulfilCreditOrder(admin({ id: 'o' }), { ...order, bonus_credits: 0 })
    expect(grantMinutes).toHaveBeenCalledTimes(1)
    expect(grantMinutes.mock.calls[0][0].kind).toBe('purchase')
  })

  it('converts credits to minutes at one hour each', async () => {
    await fulfilCreditOrder(admin({ id: 'o' }), { ...order, credits: 3, bonus_credits: 0 })
    expect(grantMinutes.mock.calls[0][0].minutes).toBe(180)
  })

  it('survives an order with no credits rather than granting NaN minutes', async () => {
    await fulfilCreditOrder(admin({ id: 'o' }), { id: 'o', user_id: 'u' })
    expect(grantMinutes.mock.calls[0][0].minutes).toBe(0)
  })

  it('writes a singular note for one credit', async () => {
    await fulfilCreditOrder(admin({ id: 'o' }), {
      ...order, credits: 1, bonus_credits: 1, pack_id: 'credit_1',
    })
    expect(grantMinutes.mock.calls[0][0].note).toBe('1 credit (credit_1)')
    expect(grantMinutes.mock.calls[1][0].note).toBe('1 free credit')
  })

  it('writes a plural note for more than one', async () => {
    await fulfilCreditOrder(admin({ id: 'o' }), order)
    expect(grantMinutes.mock.calls[0][0].note).toBe('6 credits (credit_6)')
    expect(grantMinutes.mock.calls[1][0].note).toBe('2 free credits')
  })

  it('mints a licence after the money has moved, not before', async () => {
    const seen = []
    grantMinutes.mockImplementation(() => { seen.push('grant'); return Promise.resolve() })
    ensureLicense.mockImplementation(() => { seen.push('licence'); return Promise.resolve() })

    await fulfilCreditOrder(admin({ id: 'o' }), order)
    expect(seen).toEqual(['grant', 'grant', 'licence'])
  })

  it('still reports the grant when minting the licence fails', async () => {
    /*
      Deliberate: "a licence we failed to mint is recoverable on the next
      dashboard load, but a throw between claimOrder() and grantMinutes() would
      leave an order marked paid with no credits, and the retry would skip it as
      already fulfilled."
    */
    ensureLicense.mockRejectedValue(new Error('supabase down'))
    await expect(fulfilCreditOrder(admin({ id: 'o' }), order))
      .resolves.toEqual({ granted: true, credits: 8 })
  })

  it('passes the gateway patch through to the claim', async () => {
    const db = admin({ id: 'o' })
    await fulfilCreditOrder(db, order, { razorpay_payment_id: 'pay_1' })
    expect(db.calls.update).toMatchObject({ razorpay_payment_id: 'pay_1', status: 'paid' })
  })
})

describe('isoFromUnix', () => {
  it('converts seconds to an ISO string', () => {
    expect(isoFromUnix(1767225600)).toBe(new Date(1767225600000).toISOString())
  })

  it('returns null for everything that is not a positive number', () => {
    for (const input of [0, -1, null, undefined, NaN, '1767225600', {}]) {
      expect(isoFromUnix(input), String(input)).toBeNull()
    }
  })
})
