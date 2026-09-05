import { grantMinutes } from '@smarthire/data/metering'
import { ensureLicense } from '@smarthire/data/license'
import { MINUTES_PER_CREDIT } from '@smarthire/data/credits'

/**
 * Turning a paid order into credits, and claiming a subscription order.
 *
 * EXTRACTED 2026-08-30 from app/api/stripe/webhook/route.js, where both of these
 * were local functions. With Razorpay landing, a second webhook needs exactly
 * the same behaviour, and a near-identical copy of the code that decides whether
 * to give someone free hours is not a copy anybody should be maintaining twice.
 * Same trigger as CONTROL and TH in packages/ui/src/index.jsx.
 *
 * IDEMPOTENCY IS THE WHOLE JOB, and it lives here rather than in either webhook.
 * Both gateways retry aggressively and will redeliver an event days later;
 * crediting an account twice is a real bug that shows up as free money. Two
 * things prevent it:
 *
 *   1. The order is found by a UNIQUE gateway id, so exactly one row matches —
 *      stripe_checkout_session_id, razorpay_payment_link_id or
 *      razorpay_subscription_id, depending on which gateway is calling.
 *   2. The status transition OUT OF `pending` is itself conditional on the row
 *      still being pending. A redelivery matches zero rows and grants nothing.
 *
 * (2) is the load-bearing half. (1) only narrows the search.
 */

/**
 * Flips a pending order to paid, and returns the row only if THIS call is the
 * one that did it. A redelivered or concurrent event gets null.
 *
 * The conditional update IS the lock — there is no separate select-then-update,
 * because the gap between those two is precisely where a double grant lives.
 *
 * @param {object} patch - extra columns to write in the same statement, so a
 *   gateway id and the status flip cannot end up half-applied.
 */
export async function claimOrder(admin, orderId, patch = {}) {
  const { data } = await admin
    .from('credit_orders')
    .update({ status: 'paid', paid_at: new Date().toISOString(), ...patch })
    .eq('id', orderId)
    .eq('status', 'pending')
    .select()
    .maybeSingle()

  return data ?? null
}

/**
 * Grants the hours on a credit pack. Safe to call from any gateway's handler;
 * returns `{ granted: false }` when the order was already fulfilled.
 */
export async function fulfilCreditOrder(admin, order, patch = {}) {
  const claimed = await claimOrder(admin, order.id, patch)
  if (!claimed) return { granted: false, reason: 'already fulfilled' }

  await grantMinutes({
    userId:  order.user_id,
    minutes: (order.credits || 0) * MINUTES_PER_CREDIT,
    kind:    'purchase',
    note:    `${order.credits} credit${order.credits === 1 ? '' : 's'} (${order.pack_id})`,
    orderId: order.id,
  })

  // The bonus is a separate ledger row so a customer can see what they paid for
  // and what they were given, rather than one opaque number.
  if (order.bonus_credits > 0) {
    await grantMinutes({
      userId:  order.user_id,
      minutes: order.bonus_credits * MINUTES_PER_CREDIT,
      kind:    'purchase_bonus',
      note:    `${order.bonus_credits} free credit${order.bonus_credits === 1 ? '' : 's'}`,
      orderId: order.id,
    })
  }

  /*
    AUTO-ISSUE 2026-09-01: defence in depth, not the fix. A customer who pays and
    then opens the dashboard gets their key from getEntitlement(); this covers the
    one who pays and goes straight to the desktop app.

    Deliberately AFTER the grants and deliberately not awaited for its result:
    a licence we failed to mint is recoverable on the next dashboard load, but a
    throw between claimOrder() and grantMinutes() would leave an order marked paid
    with no credits, and the retry would skip it as already fulfilled. That is why
    this is here and not inside claimOrder().
  */
  ensureLicense(order.user_id).catch(() => {})

  return { granted: true, credits: (order.credits || 0) + (order.bonus_credits || 0) }
}

/** Unix seconds to an ISO string, or null. Both gateways date things this way. */
export const isoFromUnix = (seconds) =>
  typeof seconds === 'number' && seconds > 0 ? new Date(seconds * 1000).toISOString() : null
