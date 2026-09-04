import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth'
import { setSubscription } from 'smarthire-data/metering'
import { SUBSCRIPTION_DAYS } from 'smarthire-pricing'
import { fail } from '@/lib/http'

const KINDS = Object.keys(SUBSCRIPTION_DAYS)

/**
 * Grants, extends or clears a subscription by hand.
 *
 * Customers subscribe through Stripe; this is the comp / support path — a free
 * month for a design partner, an extension while a payment problem is sorted
 * out, or clearing a subscription that was granted in error.
 *
 * An active subscription means UNLIMITED: sessions are not metered at all. That
 * makes this the most valuable thing an admin can hand out, which is why it
 * lives behind requireAdminApi, is written only by a service-role RPC, and why
 * credit_wallets has no update grant to `authenticated` at any level.
 *
 * Credits are never touched. Clearing a subscription drops the account straight
 * back onto whatever balance it had.
 *
 * Body: { userId, kind: 'weekly'|'monthly'|'yearly'|null, days?: number }
 */
export async function POST(request) {
  try {
    const gate = await requireAdminApi()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

    const { userId, kind, days } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

    if (kind != null && !KINDS.includes(kind)) {
      return NextResponse.json(
        { error: `kind must be one of ${KINDS.join(', ')}, or null to clear` }, { status: 400 })
    }

    if (kind == null) {
      const cleared = await setSubscription({ userId, kind: null, actorId: gate.user.id })
      if (!cleared?.ok) {
        return NextResponse.json({ error: cleared?.reason || 'Could not clear' }, { status: 400 })
      }
      return NextResponse.json({ success: true, unlimited: false, subscriptionKind: null })
    }

    // Default to the tier's natural length; `days` lets an admin grant a short
    // trial or a long comp without inventing a new tier.
    const length = days == null ? SUBSCRIPTION_DAYS[kind] : Number(days)
    if (!Number.isFinite(length) || length <= 0 || length > 3650) {
      return NextResponse.json({ error: 'days must be between 1 and 3650' }, { status: 400 })
    }

    const periodEnd = new Date(Date.now() + length * 24 * 60 * 60 * 1000).toISOString()

    const result = await setSubscription({
      userId,
      kind,
      status: 'active',
      periodEnd,
      actorId: gate.user.id,
    })

    if (!result?.ok) {
      return NextResponse.json(
        { error: result?.reason || 'Could not set the subscription' }, { status: 400 })
    }

    return NextResponse.json({
      success:          true,
      unlimited:        !!result.unlimited,
      subscriptionKind: result.subscriptionKind,
      periodEnd:        result.periodEnd,
    })
  // ADMIN SPLIT 2026-09-01: was `{ error: e.message }`, which handed raw
  // Postgres text to the browser. See fail() in lib/http.js.
  // } catch (e) {
  //   return NextResponse.json({ error: e.message }, { status: 500 })
  // }
  } catch (e) {
    return fail(e, 'admin/subscription')
  }
}
