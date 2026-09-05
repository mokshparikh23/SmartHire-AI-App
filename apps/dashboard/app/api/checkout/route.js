import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient, createAdminClient } from '@smarthire/data/supabase-server'
import { getStripe, siteUrl } from '@/lib/stripe'
import {
  createPaymentLink, createSubscription, planIdFor, assertPlanMatchesPricing,
} from '@/lib/razorpay'
import { gatewayFor } from '@smarthire/pricing/gateway'
import {
  PACK_BY_ID, SUBSCRIPTION_TIERS, resolveCurrency, priceOf, PRICE_TABLE,
} from '@smarthire/pricing'
import { MINUTES_PER_CREDIT } from '@smarthire/data/credits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUB_KIND_BY_ID = Object.fromEntries(SUBSCRIPTION_TIERS.map(t => [t.id, t.kind]))

const INTERVAL = {
  weekly:  { interval: 'week',  interval_count: 1 },
  monthly: { interval: 'month', interval_count: 1 },
  yearly:  { interval: 'year',  interval_count: 1 },
}

/**
 * Starts a Stripe Checkout Session for a credit pack or a subscription.
 *
 * SECURITY, and the whole reason this route reads so defensively: the body
 * carries a pack ID and NOTHING ELSE. Amount and currency are resolved
 * server-side — the amount from packages/pricing, the currency from the request's
 * geo headers. If either could be named by the client, anyone would post
 * `currency: 'INR'` or `amount: 100` and pay whatever they liked.
 *
 * The order row is written BEFORE redirecting to the gateway, in `pending`, so
 * the webhook has something to find and cannot credit an account twice.
 *
 * RAZORPAY 2026-08-30: two gateways now, chosen by the currency this route
 * already resolved — INR to Razorpay for UPI and net banking, everything else to
 * Stripe. See packages/pricing/gateway for why that is derived from the currency rather
 * than sent by the client.
 *
 * WHAT DELIBERATELY DID NOT CHANGE: the response is still `{ url }`, and the
 * order row is still written pending before the customer leaves. Both Razorpay
 * paths return a hosted page — a Payment Link for a credit pack, a subscription
 * authorisation page for a tier — so PricingPlans.jsx did not need a single
 * edit, and neither gateway can be told an amount by the browser.
 */
export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Sign in to buy credits', code: 'unauthenticated' }, { status: 401 })
    }

    const { packId } = await request.json()
    const pack = PACK_BY_ID[packId]
    if (!pack) return NextResponse.json({ error: 'Unknown pack' }, { status: 400 })

    const currency = resolveCurrency(await headers())
    const amountMinor = priceOf(packId, currency)
    if (!amountMinor) {
      return NextResponse.json({ error: 'That pack has no price set' }, { status: 400 })
    }

    // const stripe = getStripe()
    //
    // RAZORPAY 2026-08-30: constructing the Stripe client unconditionally would
    // throw on a deployment that has only Razorpay keys, before the branch that
    // does not need it is even reached. Each gateway now builds its own client
    // inside its own branch.
    const base = siteUrl(request)
    const gateway = gatewayFor(currency)
    const subscriptionKind = SUB_KIND_BY_ID[packId] ?? null
    const isSubscription = !!subscriptionKind

    const totalCredits = isSubscription ? 0 : pack.credits + pack.bonus
    const productName = isSubscription
      ? `Smart Hire AI — ${pack.label} unlimited`
      : `Smart Hire AI — ${totalCredits} credit${totalCredits === 1 ? '' : 's'}` +
        (pack.bonus ? ` (${pack.credits} + ${pack.bonus} free)` : '')

    const description = isSubscription
      ? 'Unlimited interview time for the length of the period.'
      : `${totalCredits} hour${totalCredits === 1 ? '' : 's'} of interview time, billed by the ` +
        'minute. Unused minutes never expire.'

    // Written before the redirect so the webhook always has a row to match, and
    // so an abandoned checkout leaves visible evidence rather than nothing.
    const admin = createAdminClient()
    const { data: order, error: orderError } = await admin
      .from('credit_orders')
      .insert({
        user_id:           user.id,
        kind:              isSubscription ? 'subscription' : 'credits',
        pack_id:           packId,
        credits:           isSubscription ? 0 : pack.credits,
        bonus_credits:     isSubscription ? 0 : pack.bonus,
        subscription_kind: subscriptionKind,
        amount_minor:      amountMinor,
        currency,
        gateway,
        status:            'pending',
      })
      .select()
      .single()

    if (orderError) throw orderError

    const successUrl = `${base}/dashboard/billing?checkout=success`
    const cancelUrl  = `${base}/dashboard/billing?checkout=cancelled`

    /*
      ───────────────────────────────────────────────────── Razorpay (INR)

      Both paths return a hosted page to redirect to, so the contract with the
      caller is identical to Stripe's.

      `notes` is Razorpay's metadata, and it comes back on every webhook event
      for the object. orderId is what the handler joins on, exactly as Stripe's
      `metadata.orderId` is.
    */
    if (gateway === 'razorpay') {
      const notes = {
        orderId: order.id,
        userId:  user.id,
        packId,
        // Stripe's metadata carries this so a support question can be answered
        // from the dashboard alone, without a database round trip.
        minutes: String(totalCredits * MINUTES_PER_CREDIT),
        subscriptionKind: subscriptionKind || '',
      }

      if (isSubscription) {
        const planId = planIdFor(subscriptionKind)

        // Fails closed if the Razorpay dashboard and packages/pricing disagree
        // about what this tier costs. A plan is the one place in this codebase
        // where a price lives outside packages/pricing, so it is checked rather
        // than trusted — see the long note on this function.
        await assertPlanMatchesPricing(planId, { kind: subscriptionKind, currency })

        const subscription = await createSubscription({
          planId,
          kind:  subscriptionKind,
          email: user.email || undefined,
          notes,
        })

        await admin
          .from('credit_orders')
          .update({ razorpay_subscription_id: subscription.id })
          .eq('id', order.id)

        return NextResponse.json({ url: subscription.short_url })
      }

      const link = await createPaymentLink({
        amountMinor,
        currency,
        description: `${productName} — ${description}`,
        email:       user.email || undefined,
        notes,
        // Where the customer comes BACK to. Not evidence of payment: credits are
        // granted by the webhook and nowhere else. There is no cancel URL to
        // give Razorpay — a customer who abandons a payment link simply closes
        // it, and the order row stays pending, which is the same visible
        // evidence an abandoned Stripe checkout leaves.
        callbackUrl: successUrl,
      })

      await admin
        .from('credit_orders')
        .update({ razorpay_payment_link_id: link.id })
        .eq('id', order.id)

      return NextResponse.json({ url: link.short_url })
    }

    /* ─────────────────────────────────────────────── Stripe (everything else) */
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: isSubscription ? 'subscription' : 'payment',
      // Lets Stripe reuse an existing customer for this email, which keeps a
      // subscriber's billing history in one place.
      customer_email: user.email || undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: PRICE_TABLE[currency].currency.toLowerCase(),
          unit_amount: amountMinor,
          product_data: { name: productName, description },
          ...(isSubscription ? { recurring: INTERVAL[subscriptionKind] } : {}),
        },
      }],
      // /dashboard/credits does not exist — a paying customer landed on a 404.
      success_url: successUrl,
      cancel_url:  cancelUrl,
      // The webhook reads these back. orderId is the join key; the rest is
      // there so a subscription event that arrives without a checkout session
      // can still be attributed.
      metadata: {
        orderId: order.id,
        userId:  user.id,
        packId,
        credits: String(totalCredits * MINUTES_PER_CREDIT),
        subscriptionKind: subscriptionKind || '',
      },
      ...(isSubscription
        ? { subscription_data: { metadata: { orderId: order.id, userId: user.id, subscriptionKind } } }
        : {}),
    })

    await admin
      .from('credit_orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', order.id)

    return NextResponse.json({ url: session.url })
  } catch (e) {
    console.error('Checkout error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
