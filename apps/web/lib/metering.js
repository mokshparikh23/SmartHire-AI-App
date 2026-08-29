import { createAdminClient } from './supabase-server'

/**
 * Everything that moves a credit balance.
 *
 * This is a separate file from lib/ai.js on purpose. That file contains, and
 * should keep containing, `recordUsage()` — a deliberately un-awaited,
 * error-swallowing insert with the comment "usage tracking is not worth failing
 * a request over". That is correct for an event log and fatal for money: a
 * dropped write there is a free minute here.
 *
 * So every function below is AWAITED and FAILS CLOSED. If the database cannot
 * be reached, the caller must return an error, never carry on and let the user
 * work for free.
 *
 * All of these are SECURITY DEFINER functions with EXECUTE revoked from
 * `public`, `anon` and `authenticated`, so they are only reachable through the
 * service-role client — never from a browser holding the anon key.
 */

/** How often the desktop reports in. Returned by session/start so the cadence
 *  can be retuned server-side without shipping a new desktop build. */
export const HEARTBEAT_SECONDS = 20

/** 4.5 missed heartbeats. Past this a session is swept and billed to its last
 *  heartbeat — so a crash costs the user at most one minute, and someone who
 *  stops heartbeating on purpose gains at most one minute. */
export const STALE_SECONDS = 90

/** The meter caps exposure to TIME. Nothing caps request volume, and a leaked
 *  licence key scripted flat out is worth far more than the credit it burns, so
 *  this caps it. Roughly ten hours of a very talkative interview. */
export const MAX_AI_REQUESTS_PER_SESSION = 600

/** A single admin action cannot move more than this, in either direction. */
export const MAX_GRANT_MINUTES = 100 * 60

/** The company-research call runs once at setup, before any session exists, and
 *  is the most expensive single request in the product (a web-search model).
 *  Under pure time-metering it would be free by construction, so it costs a
 *  flat minute. */
export const RESEARCH_COST_MINUTES = 1

async function rpc(fn, args) {
  const { data, error } = await createAdminClient().rpc(fn, args)
  // Throws rather than returning a falsy result: a transport failure is not a
  // verdict, and callers must be able to tell the two apart.
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data
}

export const licenseSnapshot = (licenseKey) =>
  rpc('license_snapshot', { p_license_key: licenseKey, p_stale_seconds: STALE_SECONDS })

export const startSession = ({ licenseKey, deviceId, appVersion }) =>
  rpc('session_start', {
    p_license_key:   licenseKey,
    p_device_id:     typeof deviceId === 'string' ? deviceId.slice(0, 100) : null,
    p_app_version:   typeof appVersion === 'string' ? appVersion.slice(0, 40) : null,
    p_stale_seconds: STALE_SECONDS,
  })

export const heartbeatSession = ({ sessionId, licenseKey, aiRequest = false }) =>
  rpc('session_heartbeat', {
    p_session_id:   sessionId,
    p_license_key:  licenseKey,
    p_ai_request:   aiRequest,
    p_max_requests: MAX_AI_REQUESTS_PER_SESSION,
  })

export const stopSession = ({ sessionId, licenseKey, reason }) =>
  rpc('session_stop', {
    p_session_id:  sessionId,
    p_license_key: licenseKey,
    p_reason:      reason || 'client_stop',
  })

/** Adds or removes minutes. Negative amounts are corrections and are clamped at
 *  zero by the function, which reports what it actually applied. */
export const grantMinutes = ({ userId, minutes, kind, actorId, note, orderId }) =>
  rpc('credit_grant', {
    p_user_id:  userId,
    p_minutes:  minutes,
    p_kind:     kind || 'admin_grant',
    p_actor_id: actorId || null,
    p_note:     typeof note === 'string' ? note.slice(0, 500) : null,
    p_order_id: orderId || null,
  })

/** A one-shot charge outside a session. Returns the minutes actually taken,
 *  which is 0 when the balance is empty. */
export const chargeMinutes = ({ userId, minutes, kind }) =>
  rpc('credit_debit', {
    p_user_id:    userId,
    p_session_id: null,
    p_minutes:    minutes,
    p_kind:       kind || 'session_debit',
  })

/** Is this account on an unlimited subscription right now? */
export const isUnlimited = (userId) =>
  rpc('wallet_is_unlimited', { p_user_id: userId })

/**
 * Writes subscription state. Called by the Stripe webhook and by the admin
 * dashboard (comps, support fixes) — never by anything a customer reaches.
 *
 * Pass kind: null to clear. Credits are never touched either way, so a lapsed
 * subscriber falls straight back onto whatever balance they had.
 */
export const setSubscription = ({
  userId, kind, status, periodEnd, stripeCustomerId, stripeSubscriptionId, actorId,
}) =>
  rpc('subscription_set', {
    p_user_id:             userId,
    p_kind:                kind || null,
    p_status:              status || null,
    p_period_end:          periodEnd || null,
    p_stripe_customer:     stripeCustomerId || null,
    p_stripe_subscription: stripeSubscriptionId || null,
    p_actor_id:            actorId || null,
  })
