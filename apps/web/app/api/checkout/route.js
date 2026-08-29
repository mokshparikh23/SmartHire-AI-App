import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import { getStripe, siteUrl } from '@/lib/stripe'
import {
  PACK_BY_ID, SUBSCRIPTION_TIERS, resolveCurrency, priceOf, PRICE_TABLE,
} from '@/lib/pricing'
import { MINUTES_PER_CREDIT } from '@/lib/credits'

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
 * server-side — the amount from lib/pricing.js, the currency from the request's
 * geo headers. If either could be named by the client, anyone would post
 * `currency: 'INR'` or `amount: 100` and pay whatever they liked.
 *
 * The order row is written BEFORE redirecting to Stripe, in `pending`, so the
 * webhook has something to find and cannot credit an account twice.
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

    const stripe = getStripe()
    const base = siteUrl(request)
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
        status:            'pending',
      })
      .select()
      .single()

    if (orderError) throw orderError

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
      success_url: `${base}/dashboard/billing?checkout=success`,
      cancel_url:  `${base}/dashboard/billing?checkout=cancelled`,
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
