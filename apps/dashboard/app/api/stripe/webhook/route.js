import { getStripe, getWebhookSecret } from '@/lib/stripe'
import { createAdminClient } from '@smarthire/data/supabase-server'
import { setSubscription } from '@smarthire/data/metering'
import { fulfilCreditOrder, claimOrder } from '@/lib/fulfilment'

// Signature verification needs the RAW body, so this must not run on an edge
// runtime that might transform it.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Stripe webhook.
 *
 * IDEMPOTENCY IS THE WHOLE JOB. Stripe retries aggressively and will redeliver
 * an event days later; crediting an account twice is a real bug that shows up
 * as free money. Two things prevent it:
 *
 *   1. credit_orders.stripe_checkout_session_id is UNIQUE, so an order is found
 *      by exactly one event.
 *   2. Credits are granted only on a transition OUT OF `pending`, and the update
 *      that performs that transition is itself conditional on the row still
 *      being pending. A redelivery matches zero rows and grants nothing.
 *
 * Subscription state is safe to write repeatedly — it is a set, not an
 * increment — so those events need no such guard.
 */
/*
  RAZORPAY 2026-08-30: fulfilCreditOrder() moved to lib/fulfilment.js, unchanged
  in behaviour, because the Razorpay webhook needs exactly the same thing and a
  second copy of the code that decides whether to grant free hours is not a copy
  to maintain twice. The idempotency notes that stood here moved with it — they
  describe the shared function now, and they apply to both gateways.

  Kept here rather than deleted, per the convention in this repo.

  async function fulfilCreditOrder(admin, order) {
    const totalCredits = (order.credits || 0) + (order.bonus_credits || 0)

    // The conditional update IS the lock. If a concurrent or redelivered event
    // already flipped this row, no row comes back and nothing is granted.
    const { data: claimed } = await admin
      .from('credit_orders')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', order.id)
      .eq('status', 'pending')
      .select()
      .maybeSingle()

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

    return { granted: true, credits: totalCredits }
  }
*/

async function applySubscription(admin, { userId, kind, status, periodEnd, customerId, subscriptionId }) {
  if (!userId) return
  await setSubscription({
    userId,
    kind,
    status,
    periodEnd,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  })
}

/** Finds the account behind a subscription event, which may not carry metadata. */
async function userForSubscription(admin, subscription) {
  // DELETE-ACCOUNT 2026-09-01: the resolution below is unchanged, but its answer
  // now goes through liveUser(). See the note there.
  //
  // const fromMeta = subscription?.metadata?.userId
  // if (fromMeta) return fromMeta
  return liveUser(admin, await resolveUserId(admin, subscription))
}

async function resolveUserId(admin, subscription) {
  const fromMeta = subscription?.metadata?.userId
  if (fromMeta) return fromMeta

  const { data: bySub } = await admin
    .from('credit_wallets').select('user_id')
    .eq('stripe_subscription_id', subscription.id).maybeSingle()
  if (bySub?.user_id) return bySub.user_id

  if (subscription.customer) {
    const { data: byCustomer } = await admin
      .from('credit_wallets').select('user_id')
      .eq('stripe_customer_id', subscription.customer).maybeSingle()
    if (byCustomer?.user_id) return byCustomer.user_id
  }
  return null
}

/**
 * DELETE-ACCOUNT 2026-09-01: an id that resolved is not the same as an account
 * that exists, and this endpoint is shared by everyone.
 *
 * app/api/account/delete cancels the subscription and then destroys the account,
 * so `customer.subscription.deleted` lands here seconds later. The id still
 * resolves — checkout writes subscription_data.metadata.userId, which outlives
 * the row it names — so without this we would hand a DEAD UUID to
 * setSubscription(). That calls subscription_set(), whose first statement is
 * `insert into credit_wallets (user_id) … on conflict do nothing`, and ON
 * CONFLICT DO NOTHING does not suppress a foreign-key violation. The insert
 * raises 23503, metering's rpc() throws by design, and the catch below answers
 * 500.
 *
 * That 500 is the actual damage. Stripe retries with backoff for up to three
 * days and disables endpoints that keep failing, and this is ONE endpoint for
 * every customer — so one deleted account's unprocessable event degrades
 * fulfilment for everybody. The comment on that catch says "everything above is
 * idempotent, so a retry is safe", which assumes a retry can eventually succeed.
 * For this event it never can.
 */
async function liveUser(admin, userId) {
  if (!userId) return null
  const { data } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (data?.id) return data.id
  console.log('[stripe_webhook] event for a deleted account, ignored:', userId)
  return null
}

const periodEndOf = (subscription) => {
  const seconds =
    subscription?.current_period_end ??
    subscription?.items?.data?.[0]?.current_period_end
  return seconds ? new Date(seconds * 1000).toISOString() : null
}

export async function POST(request) {
  let event
  try {
    const stripe = getStripe()
    const signature = request.headers.get('stripe-signature')
    const raw = await request.text()
    event = stripe.webhooks.constructEvent(raw, signature, getWebhookSecret())
  } catch (e) {
    // A signature failure is the one case that must never be retried or
    // half-processed: it means the request did not come from Stripe.
    return Response.json({ error: `Signature verification failed: ${e.message}` }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.payment_status !== 'paid' && session.mode !== 'subscription') break

        const { data: order } = await admin
          .from('credit_orders').select('*')
          .eq('stripe_checkout_session_id', session.id).maybeSingle()

        if (!order) break

        if (order.kind === 'credits') {
          await admin.from('credit_orders')
            .update({ stripe_payment_intent_id: session.payment_intent || null })
            .eq('id', order.id)
          await fulfilCreditOrder(admin, order)
        } else {
          // Same conditional-update lock as before, now shared with the Razorpay
          // handler. The gateway id is written in the SAME statement as the
          // status flip so the two cannot end up half-applied.
          const claimed = await claimOrder(admin, order.id, {
            stripe_subscription_id: session.subscription || null,
          })

          if (claimed) {
            // The checkout session does not carry the period end, so read it
            // from the subscription itself rather than guessing from the tier.
            const stripe = getStripe()
            const subscription = session.subscription
              ? await stripe.subscriptions.retrieve(session.subscription)
              : null

            await applySubscription(admin, {
              userId:     order.user_id,
              kind:       order.subscription_kind,
              status:     'active',
              periodEnd:  periodEndOf(subscription),
              customerId: session.customer || null,
              subscriptionId: session.subscription || null,
            })
          }
        }
        break
      }

      // Renewals, cancellations, plan changes and recovered payments all land
      // here. Writing the state is idempotent, so no claim check is needed.
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const subscription = event.data.object
        const userId = await userForSubscription(admin, subscription)
        if (!userId) break

        const status =
          subscription.status === 'active' || subscription.status === 'trialing' ? 'active'
          : subscription.status === 'past_due' || subscription.status === 'unpaid' ? 'past_due'
          : 'canceled'

        await applySubscription(admin, {
          userId,
          kind:       subscription.metadata?.subscriptionKind || null,
          status,
          periodEnd:  periodEndOf(subscription),
          customerId: subscription.customer || null,
          subscriptionId: subscription.id,
        })
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const userId = await userForSubscription(admin, subscription)
        if (!userId) break

        // Cleared rather than left as an expired row, so wallet_is_unlimited()
        // has one fewer thing to reason about. Credits are untouched: the
        // account drops back onto whatever balance it had.
        /*
          ADMIN SPLIT 2026-09-01 ─ the customer id is passed on the CANCEL path
          too, and it is not decoration.

          subscription_set() now writes a public.subscription_events row and
          derives its `source` column from what the call carries: an actor id
          means an admin did it, a gateway id means that gateway did it, and
          neither means 'system'. This call used to carry neither, so every
          genuine Stripe cancellation would have been recorded as 'system' —
          indistinguishable from a sweep, for the one event an audit trail most
          needs to attribute.

          It is a no-op for the wallet itself: stripe_customer_id is written as
          `coalesce(p_stripe_customer, stripe_customer_id)`, so passing the value
          already stored sets it to itself. stripe_subscription_id is still
          cleared, because p_kind is null.

          // await setSubscription({ userId, kind: null })
        */
        await setSubscription({
          userId,
          kind: null,
          stripeCustomerId: typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer?.id || null,
        })
        break
      }

      default:
        break
    }
  } catch (e) {
    // DELETE-ACCOUNT 2026-09-01: a foreign-key violation is the one failure a
    // retry can never fix. It means the row this event belongs to is gone —
    // the account was deleted between Stripe sending and us reading — and
    // answering 500 would put the endpoint into three days of backoff for
    // everyone else's events. liveUser() above catches the known path; this is
    // the net under every path we have not thought of.
    if (e?.code === '23503' || /violates foreign key constraint/i.test(e?.message || '')) {
      console.error(`Stripe webhook ${event.type} referenced a deleted account, dropped:`, e.message)
      return Response.json({ received: true, dropped: 'deleted_account' })
    }

    // 500 asks Stripe to retry. Everything above is idempotent, so a retry is
    // safe and is what we want when the database was briefly unavailable.
    console.error(`Stripe webhook ${event.type} failed:`, e)
    return Response.json({ error: e.message }, { status: 500 })
  }

  return Response.json({ received: true })
}
