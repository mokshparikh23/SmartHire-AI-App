import { cache } from 'react'
import { createAdminClient, createClient } from './supabase-server'

/**
 * Where an account is signed in, and how to sign it out.
 *
 * Devices come from two places and are deliberately kept in one table:
 *
 *   desktop  the Electron app, keyed by the UUID it already stores locally. It
 *            re-checks its licence on launch and every 10 seconds, so a
 *            revocation lands within about that long.
 *
 *   web      a browser, keyed by a first-party cookie we mint. Supabase exposes
 *            no way to enumerate a user's sessions, so a browser that has never
 *            registered cannot be listed — see the caveat on listDevices().
 *
 * Writes go through the service-role client on purpose. `authenticated` has
 * SELECT and nothing else, so a client cannot clear its own revoked_at.
 */

/** Cookie holding the browser's device id. Long-lived; it IS the identity. */
export const DEVICE_COOKIE = 'shai_device'
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400   // ~13 months

/**
 * A device is "active" if it has checked in recently. Desktop polls every 10s
 * while running, so anything quiet for a day is not currently in use — the badge
 * says so rather than implying a live session.
 */
export const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Human label, built here rather than accepted from the client.
 *
 * A client-supplied label is a stored-XSS vector and, more mundanely, a lying
 * client makes the list worthless — the whole point is recognising a machine you
 * do not own.
 */
export function desktopLabel({ platform, appVersion }) {
  const os =
    platform === 'darwin'  ? 'macOS' :
    platform === 'win32'   ? 'Windows' :
    platform === 'linux'   ? 'Linux' :
    'Desktop'
  return appVersion ? `${os} · Smart Hire ${appVersion}` : `${os} · Smart Hire`
}

/**
 * Browser label from the User-Agent string.
 *
 * Order matters: every Chromium browser claims "Chrome", and Chrome itself
 * claims "Safari", so the specific brands have to be tested before the generic
 * ones or everything comes out as Chrome.
 */
export function webLabel(userAgent = '') {
  const ua = String(userAgent)

  const browser =
    /Edg\//.test(ua)                        ? 'Edge' :
    /OPR\/|Opera/.test(ua)                  ? 'Opera' :
    /Firefox\//.test(ua)                    ? 'Firefox' :
    /Chrome\//.test(ua)                     ? 'Chrome' :
    /Safari\//.test(ua)                     ? 'Safari' :
    'Browser'

  const os =
    /iPhone|iPad|iPod/.test(ua)             ? 'iOS' :
    /Android/.test(ua)                      ? 'Android' :
    /Mac OS X|Macintosh/.test(ua)           ? 'macOS' :
    /Windows/.test(ua)                      ? 'Windows' :
    /Linux/.test(ua)                        ? 'Linux' :
    null

  return os ? `${browser} on ${os}` : browser
}

/**
 * Record a check-in, and report whether this device has been signed out.
 *
 * The payload deliberately omits `revoked_at`, so ON CONFLICT DO UPDATE leaves
 * it untouched: a revoked machine that keeps polling bumps its timestamp and
 * stays revoked, rather than reactivating itself on the next tick. That is the
 * single most important line in this file.
 *
 * Returns { revoked } — callers use it to decide whether to sign the caller out.
 * A write failure is NOT reported as revoked: losing the device row is not a
 * reason to throw a paying customer out of a live interview.
 */
export async function touchDevice({ userId, deviceId, kind, label, platform, appVersion }) {
  if (!userId || !deviceId) return { revoked: false }

  const { data, error } = await createAdminClient()
    .from('devices')
    .upsert(
      {
        user_id:     userId,
        device_id:   deviceId,
        kind,
        label:       label ?? null,
        platform:    platform ?? null,
        app_version: appVersion ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,device_id' },
    )
    .select('revoked_at')
    .maybeSingle()

  if (error) {
    // Same rule as validateLicense: an infrastructure failure is not a verdict.
    console.error('touchDevice failed:', error.message)
    return { revoked: false }
  }

  return { revoked: !!data?.revoked_at }
}

/**
 * Every device on the account, most recently seen first.
 *
 * CAVEAT worth repeating wherever this is rendered: this lists devices that have
 * registered since the feature shipped. A browser signed in before that, or a
 * desktop build older than the one that sends its device id, is genuinely signed
 * in and genuinely absent from this list. "Sign out everywhere" still reaches
 * them, because it revokes the Supabase session globally rather than row by row.
 *
 * Read through the cookie client so RLS applies — this is one of the few places
 * where using the service role would silently widen the blast radius of a bug in
 * the caller.
 */
export const listDevices = cache(async (userId) => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('devices')
    .select('id, device_id, kind, label, platform, app_version, first_seen_at, last_seen_at, revoked_at')
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false })

  if (error) {
    console.error('listDevices failed:', error.message)
    return []
  }
  return data ?? []
})

/** Sign out one device. Idempotent — revoking an already-revoked row is a no-op. */
export async function revokeDevice({ userId, deviceId }) {
  const { error } = await createAdminClient()
    .from('devices')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .is('revoked_at', null)

  if (error) throw error
}

/**
 * Sign out every device on the account.
 *
 * `exceptDeviceId` keeps the browser doing the revoking signed in, which is what
 * every other product does — being logged out of the page you just clicked the
 * button on reads as a bug rather than as the feature working.
 */
export async function revokeAllDevices({ userId, exceptDeviceId }) {
  let q = createAdminClient()
    .from('devices')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('revoked_at', null)

  if (exceptDeviceId) q = q.neq('device_id', exceptDeviceId)

  const { error } = await q
  if (error) throw error
}

/**
 * Clear a revocation, because the holder has just proved they can authenticate.
 *
 * FIX 2026-08-30. Without this, revoking a device BRICKED it permanently:
 * `revoked_at` was never cleared and the device cookie outlives a sign-out, so
 * the browser you signed out could log in successfully and then be bounced
 * straight back to /login by DeviceGate — forever. The same held for a desktop
 * that re-entered its licence key.
 *
 * That was the wrong semantics. "Sign out this device" ends the session on it;
 * it is not a permanent ban on a machine the account owner still controls.
 *
 * THE RULE, and the reason this is a separate function rather than part of
 * touchDevice(): an AUTOMATIC re-check must never clear a revocation — that was
 * the original bug, where a revoked desktop un-revoked itself on its next
 * ten-second poll. Only an EXPLICIT re-authentication may, so only the two
 * callers that represent one call this:
 *
 *   web      /api/devices/register?fresh=1, fired once straight after a
 *            successful sign-in
 *   desktop  /api/license/validate with activating:true, sent only when the
 *            user submits a key on the activation screen, never on the timer
 *
 * NOT a security boundary, and not pretending to be: someone holding the
 * account password can always sign in again, which is exactly what this
 * represents. The case revocation actually defends — a laptop you no longer
 * have — is defended because the person holding it cannot re-authenticate.
 */
export async function reactivateDevice({ userId, deviceId }) {
  if (!userId || !deviceId) return

  const { error } = await createAdminClient()
    .from('devices')
    .update({ revoked_at: null })
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .not('revoked_at', 'is', null)

  if (error) throw error
}

/** Has this specific browser been signed out from elsewhere? */
export async function isDeviceRevoked({ userId, deviceId }) {
  if (!userId || !deviceId) return false

  const { data, error } = await createAdminClient()
    .from('devices')
    .select('revoked_at')
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .maybeSingle()

  // Unknown device is not revoked — a browser whose row was never written must
  // not be bounced to /login on every navigation.
  if (error || !data) return false
  return !!data.revoked_at
}
