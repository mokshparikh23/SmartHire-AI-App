import { NextResponse } from 'next/server'
import { validateLicense } from '@/lib/license'

/**
 * Called by the Electron main process on activation and on a timer.
 *
 * No CORS block here on purpose: main.cjs calls this with Node's fetch, which is
 * not subject to CORS at all. Only the routes the *renderer* touches
 * (/api/ai/*, /api/license/stream) need one.
 *
 * `valid: false` is a VERDICT — it means this key does not exist or has been
 * revoked — and the desktop app responds to it by deleting the stored key and
 * signing the user out. So it must never be used for anything else:
 *
 *   - A transient database failure returns 503 with NO `valid` key, so the
 *     client retries instead of logging out. (`undefined === false` is false,
 *     which is what makes an omitted key safe with the existing client check.)
 *   - An empty balance is `valid: true` with `minutesRemaining: 0`. Running out
 *     of credits is an ordinary state of a perfectly good licence.
 */
export async function POST(request) {
  let licenseKey
  try {
    ;({ licenseKey } = await request.json())
  } catch {
    return NextResponse.json({ valid: false, reason: 'Body must be JSON' }, { status: 400 })
  }

  if (!licenseKey) {
    return NextResponse.json({ valid: false, reason: 'No license key provided' }, { status: 400 })
  }

  try {
    return NextResponse.json(await validateLicense(licenseKey))
  } catch (e) {
    return NextResponse.json(
      { error: `Could not verify the licence: ${e.message}`, retry: true },
      { status: 503 },
    )
  }
}
