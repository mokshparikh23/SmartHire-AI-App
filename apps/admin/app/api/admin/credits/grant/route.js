import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth'
import { grantMinutes, MAX_GRANT_MINUTES } from 'smarthire-data/metering'
import { MINUTES_PER_CREDIT, creditsToMinutes } from 'smarthire-data/credits'
import { fail } from '@/lib/http'

/**
 * Adds or removes session time on an account.
 *
 * This is the manual-fulfilment path and the special-discount path: any whole
 * number of minutes, in either direction. Someone can be given 2 credits, 5, 6,
 * or 20 free minutes, and a mistake can be taken back with a negative amount.
 *
 * `credits` and `minutes` are both accepted so the admin UI can offer whichever
 * reads better, but exactly one may be sent — accepting both would leave the
 * question of which wins, and getting that wrong moves money.
 */
export async function POST(request) {
  try {
    const gate = await requireAdminApi()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

    const { userId, credits, minutes, note } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

    const hasCredits = credits !== undefined && credits !== null && credits !== ''
    const hasMinutes = minutes !== undefined && minutes !== null && minutes !== ''
    if (hasCredits === hasMinutes) {
      return NextResponse.json(
        { error: 'Send exactly one of credits or minutes' }, { status: 400 })
    }

    // 2, 5 or 6 credits -> 120, 300, 360 minutes. Halves are fine (0.5 -> 30);
    // 0.51 is not, because 30.6 minutes is not something the meter can bill.
    const amount = hasCredits ? creditsToMinutes(credits) : Number(minutes)
    if (!Number.isInteger(amount) || amount === 0) {
      return NextResponse.json(
        { error: 'Amount must be a non-zero whole number of minutes' }, { status: 400 })
    }
    if (Math.abs(amount) > MAX_GRANT_MINUTES) {
      return NextResponse.json(
        { error: `Amount must be within ${MAX_GRANT_MINUTES / MINUTES_PER_CREDIT} credits` },
        { status: 400 })
    }

    const result = await grantMinutes({
      userId,
      minutes: amount,
      kind:    amount > 0 ? 'admin_grant' : 'admin_adjustment',
      actorId: gate.user.id,          // who did it, recorded on the ledger row
      note,
    })

    if (!result?.ok) {
      return NextResponse.json({ error: result?.reason || 'Grant failed' }, { status: 400 })
    }

    // requested and applied differ when a negative correction hits the floor:
    // -100 against a 30-minute balance applies -30. Both are returned so the
    // admin sees what actually happened.
    return NextResponse.json({
      success:          true,
      requestedMinutes: result.requestedMinutes,
      appliedMinutes:   result.appliedMinutes,
      minutesRemaining: result.minutesRemaining,
      ledgerId:         result.ledgerId,
    })
  // ADMIN SPLIT 2026-09-01: was `{ error: e.message }`, which handed raw
  // Postgres text to the browser. See fail() in lib/http.js.
  // } catch (e) {
  //   return NextResponse.json({ error: e.message }, { status: 500 })
  // }
  } catch (e) {
    return fail(e, 'admin/credits/grant')
  }
}
