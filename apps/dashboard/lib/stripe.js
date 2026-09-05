import Stripe from 'stripe'

/**
 * Stripe client.
 *
 * Lazily constructed rather than created at module scope, so importing anything
 * from this file does not throw during a build on a machine with no Stripe key
 * set. Checkout is the only thing that needs one, and it fails loudly at request
 * time instead.
 *
 * Prices are NOT stored in Stripe. packages/pricing is the single source of truth
 * and every Checkout Session is created with inline price_data, so changing a
 * number there does not mean editing a Stripe dashboard or keeping a set of
 * price IDs in sync. The cost is that Stripe's own reporting groups by product
 * name rather than by price object, which is a fair trade for one config file.
 */
let client = null

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set on the server')
  if (!client) client = new Stripe(key)
  return client
}

export function getWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set on the server')
  return secret
}

/**
 * Where Stripe sends the customer back. Falls back to the request's own origin
 * so local development works without configuring anything.
 *
 * SPLIT 2026-09-01 ─ READ THIS BEFORE SETTING EITHER VARIABLE.
 *
 * This builds `${base}/dashboard/billing?checkout=success`, which only exists on
 * the APP origin. Once marketing moved to smarthire.ai and the app to
 * app.smarthire.ai, a variable named NEXT_PUBLIC_SITE_URL reads like it wants
 * the marketing root — and setting it to the marketing root sends every paying
 * customer to a 404 the instant their card clears.
 *
 * That failure is as bad as it looks and worse to find: it is invisible in
 * every test that does not involve a real payment, it happens AFTER the money
 * moves, and to the customer it is indistinguishable from a failed charge.
 *
 * So the variable is renamed to say what it means. NEXT_PUBLIC_SITE_URL is
 * still read, second, so a deployment part-way through the migration keeps
 * working — remove it from the app project once the new name is set everywhere.
 *
 * LEAVE BOTH UNSET ON PREVIEW DEPLOYS. The request-origin fallback below is
 * what keeps a preview self-contained; a hardcoded production value here sends
 * a preview checkout back to production.
 *
 * // const configured = process.env.NEXT_PUBLIC_SITE_URL
 */
export function siteUrl(request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/$/, '')
  try {
    return new URL(request.url).origin
  } catch {
    return 'http://localhost:3000'
  }
}

/* ─────────────────────────────────────────────────────── account deletion */

/**
 * Cancel a subscription NOW.
 *
 * NOT `cancel_at_period_end`. The only caller is app/api/account/delete, and the
 * account is being destroyed within the next few hundred milliseconds — a
 * subscription left to lapse would keep pointing at a customer whose
 * credit_wallets row no longer exists, and its `customer.subscription.deleted`
 * event would arrive weeks later with nothing to attribute it to.
 *
 * No final invoice is raised on the way out: subscriptions.cancel defaults both
 * `invoice_now` and `prorate` to false, so cancelling does not charge the card.
 *
 * ALREADY-CANCELLED AND NOT-FOUND ARE SUCCESS, and that is not leniency — it is
 * what makes the delete route retryable. A caller that treated them as failures
 * could never finish a half-completed deletion: the second attempt would fail on
 * the subscription the first attempt had already cancelled, and the account would
 * be permanently undeletable. Everything else propagates, because "Stripe is
 * down" and "the subscription is gone" must not be the same answer.
 */
export async function cancelSubscription(id) {
  if (!id) return { ok: true, alreadyGone: true }
  try {
    const sub = await getStripe().subscriptions.cancel(id)
    return { ok: true, alreadyGone: false, status: sub?.status ?? 'canceled' }
  } catch (e) {
    if (e?.code === 'resource_missing' || e?.statusCode === 404) {
      return { ok: true, alreadyGone: true }
    }
    if (/no such subscription|already been canceled|already canceled/i.test(e?.message || '')) {
      return { ok: true, alreadyGone: true }
    }
    throw e
  }
}

/**
 * Detach every saved card from a customer. Best effort, never fatal.
 *
 * THIS IS THE ANSWER TO "DELETE MY PAYMENT DETAILS", and deleting the CUSTOMER is
 * not. `customers.del()` is irreversible and makes the invoice history
 * unreachable from the customer view — the exact opposite of what
 * public.billing_archive exists to guarantee, since our archive is only the index
 * and Stripe holds the actual document. Razorpay has no delete-customer API at
 * all, so deleting on Stripe only would make the two halves of the product behave
 * differently based on which currency the buyer's geo headers resolved to.
 *
 * Detaching removes the payment instrument — the part a person actually means —
 * and touches not one receipt.
 *
 * One card failing is not the deletion failing. The account is already on its way
 * out; a stranded payment method is a support ticket, not a reason to leave
 * someone unable to close their account.
 */
export async function detachCustomerPaymentMethods(customerId) {
  if (!customerId) return 0
  try {
    const stripe = getStripe()
    const { data } = await stripe.paymentMethods.list({ customer: customerId, limit: 100 })
    let n = 0
    for (const pm of data ?? []) {
      try { await stripe.paymentMethods.detach(pm.id); n++ } catch { /* see above */ }
    }
    return n
  } catch {
    return 0
  }
}
