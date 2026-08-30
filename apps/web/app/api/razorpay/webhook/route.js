import { verifyWebhookSignature, fetchSubscription } from '@/lib/razorpay'
import { createAdminClient } from '@/lib/supabase-server'
import { setSubscription } from '@/lib/metering'
import { fulfilCreditOrder, claimOrder, isoFromUnix } from '@/lib/fulfilment'

// Signature verification needs the RAW body, so this must not run on an edge
// runtime that might transform it.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Razorpay webhook — the INR half of fulfilment.
 *
 * Deliberately the same shape as app/api/stripe/webhook/route.js, down to the
 * status codes: 400 for a signature failure (never retry something that did not
 * come from the gateway), 500 for anything else (ask for a retry, which is safe
 * because every write below is idempotent). The parts that actually grant
 * credits live in lib/fulfilment.js and are shared by both.
 *
 * EVENTS TO ENABLE IN THE RAZORPAY DASHBOARD. Razorpay sends only what is ticked
 * on the webhook, and a missing tick is silent — the money arrives and the
 * account is never credited. The list is:
 *
 *   payment_link.paid          a credit pack was bought
 *   subscription.activated     the mandate was authorised; the tier starts
 *   subscription.charged       a renewal succeeded; the period moves forward
 *   subscription.halted        retries exhausted; treat as past due
 *   subscription.pending       a charge failed and is being retried
 *   subscription.cancelled     the customer or we cancelled it
 *   subscription.completed     total_count ran out
 *   subscription.expired       the mandate was never authorised
 *
 * WHAT IS NOT HERE, and why. `payment.captured` also fires for a payment link,
 * and handling both would mean two events racing to fulfil one order. They would
 * not double-grant — claimOrder() only lets one through — but the loser would
 * log a spurious "already fulfilled". One event per outcome is easier to read in
 * production, so the payment-link event is the one that counts.
 */

/** Razorpay puts our metadata in `notes`, which rides on every event for the object. */
const orderIdFrom = (entity) => entity?.notes?.orderId || null

/**
 * Finds the account behind a subscription event.
 *
 * Notes first because they are set at checkout and never change. The wallet
 * lookup is the fallback for an event that arrives without them — which should
 * not happen, but "should not" is not a thing to rely on when the alternative is
 * silently dropping a renewal.
 */
async function userForSubscription(admin, subscription) {
  const fromNotes = subscription?.notes?.userId
  if (fromNotes) return fromNotes

  const { data: bySub } = await admin
    .from('credit_wallets').select('user_id')
    .eq('razorpay_subscription_id', subscription.id).maybeSingle()
  if (bySub?.user_id) return bySub.user_id

  if (subscription.customer_id) {
    const { data: byCustomer } = await admin
      .from('credit_wallets').select('user_id')
      .eq('razorpay_customer_id', subscription.customer_id).maybeSingle()
    if (byCustomer?.user_id) return byCustomer.user_id
  }

  // Last resort: the order row written before the customer ever left the site.
  const { data: byOrder } = await admin
    .from('credit_orders').select('user_id, subscription_kind')
    .eq('razorpay_subscription_id', subscription.id).maybeSingle()
  return byOrder?.user_id ?? null
}

/**
 * Writes subscription state from a Razorpay subscription entity.
 *
 * `current_end` is Razorpay's period end, in unix seconds. When an event does
 * not carry it — `subscription.activated` sometimes arrives before the first
 * charge has set it — the subscription is read back rather than having a period
 * end invented from the tier. An invented date is a date that eventually cuts
 * off a paying customer, or fails to cut off one who stopped paying.
 */
async function applySubscription(admin, subscription, status) {
  const userId = await userForSubscription(admin, subscription)
  if (!userId) return

  const kind =
    subscription?.notes?.subscriptionKind ||
    (await admin
      .from('credit_orders').select('subscription_kind')
      .eq('razorpay_subscription_id', subscription.id).maybeSingle()
    ).data?.subscription_kind ||
    null

  if (!kind) return

  let periodEnd = isoFromUnix(subscription?.current_end)
  if (!periodEnd) {
    try {
      periodEnd = isoFromUnix((await fetchSubscription(subscription.id))?.current_end)
    } catch {
      // Falls through to the guard below. Better to skip the write and let the
      // next event carry it than to store a null period on an active tier —
      // subscription_set() rejects that shape anyway.
    }
  }
  if (!periodEnd) return

  await setSubscription({
    userId,
    kind,
    status,
    periodEnd,
    razorpayCustomerId:     subscription.customer_id || null,
    razorpaySubscriptionId: subscription.id,
  })
}

export async function POST(request) {
  let event
  let raw
  try {
    raw = await request.text()
    if (!verifyWebhookSignature(raw, request.headers.get('x-razorpay-signature'))) {
      throw new Error('bad signature')
    }
    event = JSON.parse(raw)
  } catch (e) {
    // A signature failure is the one case that must never be retried or
    // half-processed: it means the request did not come from Razorpay.
    return Response.json({ error: `Signature verification failed: ${e.message}` }, { status: 400 })
  }

  const admin = createAdminClient()
  const type = event?.event

  try {
    switch (type) {
      case 'payment_link.paid': {
        const link = event.payload?.payment_link?.entity
        const payment = event.payload?.payment?.entity
        if (!link) break

        // Found by the UNIQUE column first, which is the guarantee of exactly one
        // match. `notes.orderId` is the fallback for the same reason it exists on
        // the Stripe side: an event that lost its join column can still be
        // attributed rather than dropped.
        let { data: order } = await admin
          .from('credit_orders').select('*')
          .eq('razorpay_payment_link_id', link.id).maybeSingle()

        if (!order) {
          const fallbackId = orderIdFrom(link)
          // Guarded: `.eq('id', null)` on a uuid column is an error, not an
          // empty result, and it would turn a missing note into a 500 and an
          // endless retry.
          if (fallbackId) {
            ;({ data: order } = await admin
              .from('credit_orders').select('*')
              .eq('id', fallbackId).maybeSingle())
          }
        }

        if (!order || order.kind !== 'credits') break

        await fulfilCreditOrder(admin, order, {
          razorpay_payment_id: payment?.id || null,
        })
        break
      }

      case 'subscription.activated':
      case 'subscription.charged': {
        const subscription = event.payload?.subscription?.entity
        if (!subscription) break

        // Claiming the order is what makes the FIRST activation distinguishable
        // from every renewal after it. Renewals find nothing to claim and fall
        // straight through to the state write, which is what we want — a renewal
        // is not a new purchase.
        const { data: order } = await admin
          .from('credit_orders').select('*')
          .eq('razorpay_subscription_id', subscription.id).maybeSingle()

        if (order && order.kind === 'subscription') {
          await claimOrder(admin, order.id, {
            razorpay_payment_id: event.payload?.payment?.entity?.id || null,
          })
        }

        await applySubscription(admin, subscription, 'active')
        break
      }

      // A charge failed and Razorpay is retrying, or it has given up. Either way
      // the tier is not paid for right now, and past_due is the state the wallet
      // already understands.
      case 'subscription.pending':
      case 'subscription.halted': {
        const subscription = event.payload?.subscription?.entity
        if (subscription) await applySubscription(admin, subscription, 'past_due')
        break
      }

      case 'subscription.cancelled':
      case 'subscription.completed':
      case 'subscription.expired': {
        const subscription = event.payload?.subscription?.entity
        if (!subscription) break
        const userId = await userForSubscription(admin, subscription)
        if (!userId) break

        // Cleared rather than left as an expired row, exactly as the Stripe
        // handler does it, so wallet_is_unlimited() has one fewer thing to reason
        // about. Credits are untouched: the account drops back onto whatever
        // balance it had.
        await setSubscription({ userId, kind: null })
        break
      }

      default:
        break
    }
  } catch (e) {
    // 500 asks Razorpay to retry. Everything above is idempotent, so a retry is
    // safe and is what we want when the database was briefly unavailable.
    console.error(`Razorpay webhook ${type} failed:`, e)
    return Response.json({ error: e.message }, { status: 500 })
  }

  return Response.json({ received: true })
}
