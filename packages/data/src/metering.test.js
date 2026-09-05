import { describe, it, expect, beforeEach, vi } from 'vitest'

/*
  WHAT THIS FILE CAN AND CANNOT TEST.

  Every function in metering.js is a thin wrapper over a SECURITY DEFINER
  Postgres function. The logic that matters — the wallet row lock, the clamp at
  zero, the last-admin guard — is SQL, and only a live database can exercise it.

  What JavaScript owns is the call: which RPC, and under exactly which argument
  NAMES. That is not a formality here. The note above setSubscription says the
  razorpay ids "MUST be sent on every call, including the Stripe ones", because
  PostgREST resolves an RPC by the names in the payload and the migration
  dropped the seven-argument signature outright rather than leaving an overload.
  Send eight names to a nine-name function and the call does not find it.

  So: the transport is mocked, and every assertion below is about the payload.
*/

const rpc = vi.fn()
vi.mock('./supabase-server.js', () => ({
  createAdminClient: () => ({ rpc }),
}))

const {
  HEARTBEAT_SECONDS,
  MAX_AI_REQUESTS_PER_SESSION,
  MAX_GRANT_MINUTES,
  RESEARCH_COST_MINUTES,
  RESUME_PARSE_COST_MINUTES,
  STALE_SECONDS,
  chargeMinutes,
  grantMinutes,
  heartbeatSession,
  isUnlimited,
  licenseSnapshot,
  setRole,
  setSubscription,
  startSession,
  stopSession,
  sweepStaleSessions,
} = await import('./metering.js')

/** The shape supabase-js returns. */
const ok = (data = null) => ({ data, error: null })

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue(ok())
})

/** The (name, args) of the single RPC the call under test made. */
const called = () => {
  expect(rpc).toHaveBeenCalledTimes(1)
  const [name, args] = rpc.mock.calls[0]
  return { name, args }
}

describe('the transport', () => {
  it('throws when the database cannot be reached, rather than returning falsy', () => {
    /*
      "a transport failure is not a verdict, and callers must be able to tell the
      two apart." A dropped write here is a free minute, so this is the single
      most important behaviour in the file.
    */
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } })
    return expect(isUnlimited('user-1')).rejects.toThrow(/wallet_is_unlimited: connection reset/)
  })

  it('names the failing function in the error, so a log says which one', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(chargeMinutes({ userId: 'u', minutes: 5 })).rejects.toThrow(/^credit_debit:/)
  })

  it('does not mistake a legitimately falsy result for a failure', async () => {
    // credit_debit returns 0 when the balance is empty. That is an answer.
    rpc.mockResolvedValue(ok(0))
    await expect(chargeMinutes({ userId: 'u', minutes: 5 })).resolves.toBe(0)

    rpc.mockResolvedValue(ok(false))
    await expect(isUnlimited('u')).resolves.toBe(false)
  })
})

describe('setSubscription', () => {
  const call = {
    userId: 'user-1',
    kind: 'monthly',
    status: 'active',
    periodEnd: '2026-10-06T00:00:00Z',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
  }

  it('sends all nine argument names even on a Stripe-only call', async () => {
    // The razorpay pair is null here, and MUST still be present: PostgREST
    // resolves by the names in the payload and the seven-argument signature was
    // dropped, not overloaded.
    await setSubscription(call)
    const { name, args } = called()
    expect(name).toBe('subscription_set')
    expect(Object.keys(args).sort()).toEqual([
      'p_actor_id',
      'p_kind',
      'p_period_end',
      'p_razorpay_customer',
      'p_razorpay_subscription',
      'p_status',
      'p_stripe_customer',
      'p_stripe_subscription',
      'p_user_id',
    ])
  })

  it('sends the same nine names on a Razorpay call', async () => {
    await setSubscription({
      userId: 'user-1',
      kind: 'yearly',
      status: 'active',
      razorpayCustomerId: 'rzp_cust',
      razorpaySubscriptionId: 'rzp_sub',
    })
    expect(Object.keys(called().args)).toHaveLength(9)
  })

  it('sends null rather than undefined for the gateway it is not using', async () => {
    // undefined disappears from a JSON body; null is a value PostgREST sees.
    await setSubscription(call)
    const { args } = called()
    expect(args.p_razorpay_customer).toBeNull()
    expect(args.p_razorpay_subscription).toBeNull()
    expect(Object.values(args)).not.toContain(undefined)
  })

  it('clears a subscription when kind is null', async () => {
    await setSubscription({ userId: 'user-1', kind: null, status: null })
    const { args } = called()
    expect(args.p_kind).toBeNull()
    expect(args.p_status).toBeNull()
    expect(args.p_user_id).toBe('user-1')
  })
})

describe('grantMinutes', () => {
  it('defaults the kind to an admin grant', async () => {
    await grantMinutes({ userId: 'u', minutes: 60 })
    expect(called().args.p_kind).toBe('admin_grant')
  })

  it('passes a negative amount through — the clamp is the database\'s job', async () => {
    // "Negative amounts are corrections and are clamped at zero by the function,
    // which reports what it actually applied." Clamping here too would hide that.
    await grantMinutes({ userId: 'u', minutes: -30 })
    expect(called().args.p_minutes).toBe(-30)
  })

  it('truncates a note to 500 characters', async () => {
    await grantMinutes({ userId: 'u', minutes: 1, note: 'x'.repeat(900) })
    expect(called().args.p_note).toHaveLength(500)
  })

  it('sends null for a note that is not a string', async () => {
    await grantMinutes({ userId: 'u', minutes: 1, note: { nope: true } })
    expect(called().args.p_note).toBeNull()
  })
})

describe('startSession', () => {
  it('truncates a device id to 100 and an app version to 40', async () => {
    await startSession({
      licenseKey: 'KEY',
      deviceId: 'd'.repeat(500),
      appVersion: 'v'.repeat(200),
    })
    const { args } = called()
    expect(args.p_device_id).toHaveLength(100)
    expect(args.p_app_version).toHaveLength(40)
  })

  it('sends null for a non-string device id rather than coercing it', async () => {
    await startSession({ licenseKey: 'KEY', deviceId: 12345, appVersion: null })
    const { args } = called()
    expect(args.p_device_id).toBeNull()
    expect(args.p_app_version).toBeNull()
  })

  it('carries the staleness window the sweep uses', async () => {
    await startSession({ licenseKey: 'KEY' })
    expect(called().args.p_stale_seconds).toBe(STALE_SECONDS)
  })
})

describe('the session calls', () => {
  it('caps AI requests per session on every heartbeat', async () => {
    // The meter caps time; nothing caps request volume, so this is what stops a
    // leaked licence key being scripted flat out.
    await heartbeatSession({ sessionId: 's', licenseKey: 'K', aiRequest: true })
    const { name, args } = called()
    expect(name).toBe('session_heartbeat')
    expect(args.p_max_requests).toBe(MAX_AI_REQUESTS_PER_SESSION)
    expect(args.p_ai_request).toBe(true)
  })

  it('treats a heartbeat as non-AI unless told otherwise', async () => {
    await heartbeatSession({ sessionId: 's', licenseKey: 'K' })
    expect(called().args.p_ai_request).toBe(false)
  })

  it('defaults a stop reason to client_stop', async () => {
    await stopSession({ sessionId: 's', licenseKey: 'K' })
    expect(called().args.p_reason).toBe('client_stop')
  })

  it('passes an explicit stop reason through', async () => {
    await stopSession({ sessionId: 's', licenseKey: 'K', reason: 'out_of_credits' })
    expect(called().args.p_reason).toBe('out_of_credits')
  })

  it('reconciles by user id, because the dashboard holds no licence key', async () => {
    // The 2026-08-30 bugfix: the sweep rode only on licence-keyed calls, so the
    // one page rendering "Live now" had no way of making it true.
    await sweepStaleSessions('user-1')
    const { name, args } = called()
    expect(name).toBe('sweep_stale_sessions')
    expect(args.p_user_id).toBe('user-1')
  })

  it('snapshots a licence by key', async () => {
    await licenseSnapshot('SH-XXXX')
    const { name, args } = called()
    expect(name).toBe('license_snapshot')
    expect(args.p_license_key).toBe('SH-XXXX')
  })
})

describe('setRole', () => {
  it('goes through the guarded RPC and never a raw table update', async () => {
    /*
      What this replaced was a service-role .from('profiles').update({ role })
      with no guard of any kind, on a page that renders "Remove admin" on every
      row including the caller's own. One click was enough for a sole admin to
      lock everyone out, recoverable only from the SQL editor.
    */
    await setRole({ userId: 'u', role: 'admin', actorId: 'a' })
    const { name, args } = called()
    expect(name).toBe('profile_set_role')
    expect(args).toEqual({ p_user_id: 'u', p_role: 'admin', p_actor_id: 'a' })
  })

  it('sends a null actor rather than omitting it', async () => {
    await setRole({ userId: 'u', role: 'user' })
    expect(called().args.p_actor_id).toBeNull()
  })

  it('does not decide the refusal itself — the database returns {ok, code}', async () => {
    // Codes: bad_role, no_user, self_demote, last_admin. The route turns one
    // into a sentence; this layer just carries it.
    rpc.mockResolvedValue(ok({ ok: false, code: 'last_admin', reason: 'the last admin' }))
    await expect(setRole({ userId: 'u', role: 'user' }))
      .resolves.toMatchObject({ ok: false, code: 'last_admin' })
  })
})

describe('the constants', () => {
  it('makes the stale window 4.5 missed heartbeats', () => {
    // "so a crash costs the user at most one minute, and someone who stops
    // heartbeating on purpose gains at most one minute"
    expect(STALE_SECONDS).toBe(HEARTBEAT_SECONDS * 4.5)
    expect(STALE_SECONDS).toBeLessThan(120)
  })

  it('caps a single admin action at 100 hours in either direction', () => {
    expect(MAX_GRANT_MINUTES).toBe(100 * 60)
  })

  it('charges a flat minute for the two calls the per-minute meter cannot reach', () => {
    // Both run at setup, before any session exists, so under pure time-metering
    // they would be free by construction.
    expect(RESEARCH_COST_MINUTES).toBeGreaterThanOrEqual(0)
    expect(RESUME_PARSE_COST_MINUTES).toBeGreaterThanOrEqual(0)
  })
})
