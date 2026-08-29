import crypto from 'crypto'
import { createAdminClient } from './supabase-server'
import { licenseSnapshot } from './metering'

// Generate a unique license key like: IA-XXXX-XXXX-XXXX-XXXX
export function generateLicenseKey() {
  const seg = () => crypto.randomBytes(2).toString('hex').toUpperCase()
  return `IA-${seg()}-${seg()}-${seg()}-${seg()}`
}

/**
 * Issue an activation key.
 *
 * A licence carries no plan and no expiry any more — it is purely "this key
 * belongs to this account, and is active or revoked". What the account may DO
 * lives on its credit wallet, so a user holding two keys shares one balance and
 * one subscription.
 */
export async function createLicense({ userId }) {
  const { data, error } = await createAdminClient()
    .from('licenses')
    .insert({ user_id: userId, license_key: generateLicenseKey(), status: 'active' })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Validate a licence key. Called by the desktop app on activation, on a timer,
 * and once every stream tick.
 *
 * TWO RULES GOVERN THIS FUNCTION, and both exist because
 * apps/desktop/src/App.jsx deletes the stored key and signs the user out the
 * moment it sees `valid: false`.
 *
 * 1. A DATABASE ERROR IS NOT A VERDICT — it throws. The previous version read
 *    `if (error || !data) return { valid: false }`, where `error` covered both
 *    "no rows" and a transient Supabase failure, so a blip logged everyone out.
 *    /api/license/stream documents that a DB error must never emit valid:false;
 *    throwing here is what finally makes that true.
 *
 * 2. AN EMPTY BALANCE IS NOT `valid: false`. Running out of credits is an
 *    ordinary state of a perfectly good licence. It travels as
 *    minutesRemaining: 0 alongside valid: true, and the app shows a top-up
 *    prompt rather than throwing the user back to the activation screen.
 */
export async function validateLicense(licenseKey) {
  const data = await licenseSnapshot(licenseKey)

  if (!data?.found)             return { valid: false, reason: 'License not found' }
  if (data.status !== 'active') return { valid: false, reason: 'License revoked' }

  return {
    valid:     true,
    email:     data.email,
    name:      data.name,
    // Used by the /api/ai routes to attribute usage rows to the licence holder.
    userId:    data.userId,
    licenseId: data.licenseId,

    // On an unlimited subscription, sessions are not metered at all. The desktop
    // app must show "Unlimited" for this and must NOT fall back to rendering
    // minutesRemaining, which keeps sitting there underneath as the balance the
    // account returns to if the subscription lapses.
    unlimited:             !!data.unlimited,
    subscriptionKind:      data.subscriptionKind ?? null,
    subscriptionStatus:    data.subscriptionStatus ?? null,
    subscriptionPeriodEnd: data.subscriptionPeriodEnd ?? null,

    // Credit balance in whole minutes. Zero is a valid licence with nothing left.
    minutesRemaining: data.minutesRemaining ?? 0,

    activeSession: data.activeSession ?? null,
  }
}
