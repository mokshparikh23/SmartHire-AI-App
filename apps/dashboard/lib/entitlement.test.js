import { describe, it, expect, beforeEach, vi } from 'vitest'

/*
  getEntitlement() is the answer three dashboard pages render from, and the one
  that decides whether somebody is metered at all. Getting `unlimited` wrong in
  either direction is expensive: false when it should be true meters a paying
  subscriber, true when it should be false gives away unlimited call time.

  react's cache() is replaced with identity. In a real render it collapses the
  sidebar's ask and the page's into one; in a test it would memoise across cases
  and hand the second assertion the first one's wallet.
*/
vi.mock('react', () => ({ cache: (fn) => fn }))

const maybeSingle = vi.fn()
const licensesQuery = vi.fn()
const ensureLicense = vi.fn()

vi.mock('@smarthire/data/supabase-server', () => ({
  createClient: async () => ({
    from (table) {
      // Both queries chain select/eq; only the wallet ends in maybeSingle(),
      // and the licences query is awaited on the builder itself.
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        maybeSingle: () => maybeSingle(),
        then: (resolve, reject) =>
          Promise.resolve(table === 'licenses' ? licensesQuery() : { data: null })
            .then(resolve, reject),
      }
      return builder
    },
  }),
}))

vi.mock('@smarthire/data/license', () => ({
  ensureLicense: (...args) => ensureLicense(...args),
}))

const { getEntitlement } = await import('./entitlement.js')

const HOUR = 60 * 60 * 1000
const future = () => new Date(Date.now() + 24 * HOUR).toISOString()
const past = () => new Date(Date.now() - 24 * HOUR).toISOString()

/** Sets what the two queries return for the next call. */
const given = ({ wallet = null, licenses = [] } = {}) => {
  maybeSingle.mockResolvedValue({ data: wallet })
  licensesQuery.mockReturnValue({ data: licenses })
}

const activeLicense = { id: 'lic-1', status: 'active', key: 'SH-AAAA' }

beforeEach(() => {
  maybeSingle.mockReset()
  licensesQuery.mockReset()
  ensureLicense.mockReset()
  ensureLicense.mockResolvedValue(null)
})

describe('unlimited', () => {
  it('is true for an active subscription inside its period', () => {
    given({ wallet: {
      subscription_kind: 'monthly',
      subscription_status: 'active',
      subscription_period_end: future(),
    } })
    return expect(getEntitlement('u')).resolves.toMatchObject({ unlimited: true })
  })

  it('is true for past_due, because Stripe retries for days', async () => {
    /*
      "cutting someone off over a card that will probably clear is the wrong
      trade." This is the clause most likely to be tidied away by someone who
      reads past_due as "not paying".
    */
    given({ wallet: {
      subscription_kind: 'monthly',
      subscription_status: 'past_due',
      subscription_period_end: future(),
    } })
    await expect(getEntitlement('u')).resolves.toMatchObject({ unlimited: true })
  })

  it('is false once the period has ended, whatever the status says', async () => {
    given({ wallet: {
      subscription_kind: 'yearly',
      subscription_status: 'active',
      subscription_period_end: past(),
    } })
    await expect(getEntitlement('u')).resolves.toMatchObject({ unlimited: false })
  })

  it('is false for every status that is not active or past_due', async () => {
    for (const status of ['canceled', 'incomplete', 'unpaid', 'paused', 'trialing']) {
      given({ wallet: {
        subscription_kind: 'monthly',
        subscription_status: status,
        subscription_period_end: future(),
      } })
      await expect(getEntitlement('u'), status).resolves.toMatchObject({ unlimited: false })
    }
  })

  it('is false with no period end at all', async () => {
    given({ wallet: {
      subscription_kind: 'monthly',
      subscription_status: 'active',
      subscription_period_end: null,
    } })
    await expect(getEntitlement('u')).resolves.toMatchObject({ unlimited: false })
  })

  it('is false with no subscription kind, however healthy the rest looks', async () => {
    given({ wallet: {
      subscription_kind: null,
      subscription_status: 'active',
      subscription_period_end: future(),
    } })
    await expect(getEntitlement('u')).resolves.toMatchObject({ unlimited: false })
  })

  it('is false for an account that has never had a wallet row', async () => {
    given({ wallet: null })
    await expect(getEntitlement('u')).resolves.toMatchObject({ unlimited: false, minutes: 0 })
  })
})

describe('the licence', () => {
  it('returns the newest active licence when there is one', async () => {
    given({ licenses: [activeLicense, { id: 'lic-0', status: 'active' }] })
    const e = await getEntitlement('u')
    expect(e.license).toBe(activeLicense)
    expect(ensureLicense).not.toHaveBeenCalled()
  })

  it('mints the first licence on the first render that finds none', async () => {
    given({ licenses: [] })
    ensureLicense.mockResolvedValue(activeLicense)

    const e = await getEntitlement('u')
    expect(ensureLicense).toHaveBeenCalledWith('u')
    // The 2026-09-01 fix: the freshly minted key has to be the one THIS render
    // returns, or the card stays empty until a reload.
    expect(e.license).toBe(activeLicense)
  })

  it('leaves a revoked account looking revoked instead of minting over it', async () => {
    // The query filters status = 'active', so a revoked account also lands in
    // the mint branch. ensureLicense returns the revoked row deliberately.
    given({ licenses: [] })
    ensureLicense.mockResolvedValue({ id: 'lic-1', status: 'revoked' })

    await expect(getEntitlement('u')).resolves.toMatchObject({ license: null })
  })

  it('renders the licence-less state rather than a 500 when minting fails', async () => {
    given({ licenses: [] })
    ensureLicense.mockRejectedValue(new Error('supabase down'))

    await expect(getEntitlement('u')).resolves.toMatchObject({ license: null })
  })
})

describe('onFreePlan', () => {
  /*
    Deliberately narrower than "balance is small": "someone who bought an hour
    and used most of it is a customer, not a trial user". The test is spent +
    remaining, not remaining alone.
  */
  it('is true for an untouched signup grant', async () => {
    given({ wallet: { minutes_balance: 10, minutes_spent_total: 0 } })
    await expect(getEntitlement('u')).resolves.toMatchObject({ onFreePlan: true })
  })

  it('is true part-way through the grant', async () => {
    given({ wallet: { minutes_balance: 4, minutes_spent_total: 6 } })
    await expect(getEntitlement('u')).resolves.toMatchObject({ onFreePlan: true })
  })

  it('is false for someone who bought an hour and nearly spent it', async () => {
    given({ wallet: { minutes_balance: 3, minutes_spent_total: 67 } })
    await expect(getEntitlement('u')).resolves.toMatchObject({ onFreePlan: false })
  })

  it('is false one minute past the grant', async () => {
    given({ wallet: { minutes_balance: 11, minutes_spent_total: 0 } })
    await expect(getEntitlement('u')).resolves.toMatchObject({ onFreePlan: false })
  })

  it('is false for a subscriber regardless of their balance', async () => {
    given({ wallet: {
      minutes_balance: 0,
      minutes_spent_total: 0,
      subscription_kind: 'monthly',
      subscription_status: 'active',
      subscription_period_end: future(),
    } })
    await expect(getEntitlement('u')).resolves.toMatchObject({ onFreePlan: false, unlimited: true })
  })
})

describe('the returned shape', () => {
  it('defaults the numbers to zero rather than undefined', async () => {
    given({ wallet: {} })
    const e = await getEntitlement('u')
    expect(e.minutes).toBe(0)
    expect(e.spentTotal).toBe(0)
    expect(e.subscriptionKind).toBeNull()
    expect(e.subscriptionStatus).toBeNull()
    expect(e.periodEnd).toBeNull()
  })

  it('hands back periodEnd as a Date, which is what the pages format', async () => {
    const iso = future()
    given({ wallet: { subscription_period_end: iso } })
    const e = await getEntitlement('u')
    expect(e.periodEnd).toBeInstanceOf(Date)
    expect(e.periodEnd.toISOString()).toBe(iso)
  })
})
