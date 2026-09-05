import { NextResponse } from 'next/server'
import { validateLicense } from '@smarthire/data/license'
import { touchDevice, reactivateDevice, desktopLabel } from '@/lib/devices'

/**
 * Called by the Electron main process on activation and on a timer.
 *
 * No CORS block here on purpose: main.cjs calls this with Node's fetch, which is
 * not subject to CORS at all. Only the routes the *renderer* touches
 * (/api/ai/*, /api/license/stream) need one.
 *
 * `valid: false` is a VERDICT — it means this key does not exist, has been
 * revoked, or this machine has been signed out — and the desktop app responds by
 * deleting the stored key and signing the user out. So it must never be used for
 * anything else:
 *
 *   - A transient database failure returns 503 with NO `valid` key, so the
 *     client retries instead of logging out. (`undefined === false` is false,
 *     which is what makes an omitted key safe with the existing client check.)
 *   - An empty balance is `valid: true` with `minutesRemaining: 0`. Running out
 *     of credits is an ordinary state of a perfectly good licence.
 *
 * DEVICES 2026-08-30: this is also the device heartbeat. It was the natural
 * place for it — the app already calls this on launch and every 10 seconds,
 * whereas /api/session/start (which has had a deviceId all along) only fires
 * when an interview begins, so a machine that was signed in but idle could never
 * have been listed or revoked.
 */
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ valid: false, reason: 'Body must be JSON' }, { status: 400 })
  }

  const { licenseKey, deviceId, platform, appVersion, activating } = body || {}

  if (!licenseKey) {
    return NextResponse.json({ valid: false, reason: 'No license key provided' }, { status: 400 })
  }

  let result
  try {
    result = await validateLicense(licenseKey)
  } catch (e) {
    return NextResponse.json(
      { error: `Could not verify the licence: ${e.message}`, retry: true },
      { status: 503 },
    )
  }

  /*
    deviceId is optional, and must stay that way: builds shipped before this
    change do not send one. They keep working exactly as before — they simply
    cannot be listed or signed out remotely until the user updates. Rejecting
    them would brick every installed copy on deploy.
  */
  if (result.valid && deviceId) {
    /*
      FIX 2026-08-30: an explicit activation clears a revocation first.

      Without this, signing a machine out from the dashboard bricked it: the
      revocation was never cleared, so re-entering the licence key returned
      valid:false forever and the app could never be activated again. "Sign out
      this device" has to mean "end the session on it", not "ban this computer".

      Guarded on `activating`, which only the activation screen sends. The launch
      check and the ten-second loop must NOT clear it, or a revoked app would
      quietly un-revoke itself on its next poll — the original bug this whole
      flag-rather-than-delete design exists to prevent.
    */
    if (activating === true) {
      try {
        await reactivateDevice({ userId: result.userId, deviceId })
      } catch {
        // Non-fatal: a bookkeeping failure must not block a valid activation.
      }
    }

    const { revoked } = await touchDevice({
      userId:   result.userId,
      deviceId,
      kind:     'desktop',
      label:    desktopLabel({ platform, appVersion }),
      platform,
      appVersion,
    })

    /*
      A revoked device is reported as an invalid licence, which is what makes the
      existing client behaviour — delete the key, return to the activation
      screen — do the right thing with no desktop change beyond sending the id.

      The reason string is distinct so the app can eventually say "you signed this
      machine out" rather than "your licence was revoked"; today it just shows it.
    */
    if (revoked) {
      return NextResponse.json({ valid: false, reason: 'This device was signed out' })
    }
  }

  return NextResponse.json(result)
}
