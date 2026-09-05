import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth'
import { ensureLicense } from '@smarthire/data/license'
import { grantMinutes, MAX_GRANT_MINUTES } from '@smarthire/data/metering'
import { MINUTES_PER_CREDIT, creditsToMinutes } from '@smarthire/data/credits'
import { fail } from '@/lib/http'

/**
 * Issues an activation key, optionally funded.
 *
 * There is no plan to pick any more: a licence is just "this key belongs to this
 * account". What the account can do is decided by its credit balance and
 * subscription, so issuing and funding in one action matches how manual
 * fulfilment actually happens — someone pays, and they need a working app, not a
 * key that cannot start a session.
 *
 * The credits are granted AFTER the licence exists, and a failure there is
 * reported rather than swallowed: a key that silently arrives empty looks to the
 * customer exactly like a key that does not work.
 *
 * AUTO-ISSUE 2026-09-01: ensureLicense(), not createLicense(). Every account now
 * mints its own key on first dashboard load, so a bare createLicense() here would
 * hand out a SECOND key to essentially every user this route is aimed at. What is
 * left of manual fulfilment is the credits, which is the half admins actually
 * use — so this returns the key the account already has and grants on top of it.
 */
export async function POST(request) {
  try {
    const gate = await requireAdminApi()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

    const { userId, credits } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

    const startingMinutes = credits ? creditsToMinutes(credits) : 0
    if (!Number.isInteger(startingMinutes) || startingMinutes < 0) {
      return NextResponse.json(
        { error: 'Starting credits must be a whole number of minutes' }, { status: 400 })
    }
    if (startingMinutes > MAX_GRANT_MINUTES) {
      return NextResponse.json(
        { error: `Starting credits must be within ${MAX_GRANT_MINUTES / MINUTES_PER_CREDIT} credits` },
        { status: 400 })
    }

    // const license = await createLicense({ userId })
    const license = await ensureLicense(userId)

    // A revoked licence is not a licence to fund. Say so rather than granting
    // minutes onto a key the desktop app will refuse at the next validate tick.
    if (license.status !== 'active') {
      return NextResponse.json({
        error: `${license.license_key} is ${license.status}. Un-revoke it before granting credits.`,
      }, { status: 409 })
    }

    let minutesRemaining = null
    if (startingMinutes > 0) {
      const granted = await grantMinutes({
        userId,
        minutes: startingMinutes,
        kind:    'admin_grant',
        actorId: gate.user.id,
        note:    'Granted with the licence key',
      })
      if (!granted?.ok) {
        return NextResponse.json({
          error: `Licence ${license.license_key} was issued, but the credits failed: ` +
                 `${granted?.reason || 'unknown error'}. Grant them from the user's row.`,
        }, { status: 500 })
      }
      minutesRemaining = granted.minutesRemaining
    }

    return NextResponse.json({ ...license, minutesRemaining })
  // ADMIN SPLIT 2026-09-01: fail() logs the same detail this already logged and
  // returns a constant instead of e.message. See lib/http.js.
  // } catch (e) {
  //   console.error('Issue license error:', e)
  //   return NextResponse.json({ error: e.message }, { status: 500 })
  // }
  } catch (e) {
    return fail(e, 'admin/licenses/issue')
  }
}
