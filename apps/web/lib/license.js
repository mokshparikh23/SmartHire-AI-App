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
 * The account's licence, minting one the first time it is asked for.
 *
 * AUTO-ISSUE 2026-09-01. Until now createLicense() had exactly one caller —
 * /api/admin/licenses/issue — and handle_new_user() grants a wallet but no
 * licence. Neither payment webhook issues one either. So every user, paying or
 * free, reached LicenseGate in the desktop app with nothing to paste and no way
 * to get it without an admin. The 10 free minutes the signup trigger grants were
 * unspendable.
 *
 * WHY HERE AND NOT IN handle_new_user(). Doing it in SQL means reimplementing
 * generateLicenseKey()'s format in plpgsql — a second definition of a format, in
 * a repo that has already paid for exactly that kind of drift once. Worse, the
 * insert would run inside the auth transaction against a UNIQUE license_key, so
 * a collision would abort the signup itself. A user who cannot create an account
 * is a strictly worse failure than a user without a key.
 *
 * THE SELECT IS STATUS-AGNOSTIC, AND THAT IS THE WHOLE CORRECTNESS ARGUMENT.
 * getEntitlement() reads `status = 'active'`, so an account whose only licence
 * was revoked looks licence-less to it. If this function filtered the same way
 * it would mint a fresh key on the revoked user's next dashboard load and hand
 * the app straight back to them. Finding the revoked row and returning it is
 * what makes revocation stick; callers decide what to do with a non-active row.
 */
export async function ensureLicense(userId) {
  const admin = createAdminClient()

  const read = async () => {
    const { data, error } = await admin
      .from('licenses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    // Prefer an active key for the RETURN value, but any row at all — revoked
    // included — means we must not mint.
    return data?.length ? (data.find((l) => l.status === 'active') ?? data[0]) : null
  }

  const existing = await read()
  if (existing) return existing

  try {
    return await createLicense({ userId })
  } catch (e) {
    // 23505 is the partial unique index on (user_id) where status = 'active'.
    // Two tabs opening the dashboard at once is the ordinary way to get here;
    // the key the other one minted is just as good as the one we wanted.
    if (e?.code === '23505') return await read()
    // A database wobble is not "no licence" — same rule validateLicense() keeps
    // below. Swallowing it here would show a paying customer an empty card.
    throw e
  }
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
