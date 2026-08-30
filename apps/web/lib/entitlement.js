import { cache } from 'react'
import { createClient } from './supabase-server'

/**
 * What a signed-in customer is currently entitled to, read through the cookie
 * client so RLS still applies.
 *
 * Three dashboard pages need the same answer and would otherwise each assemble
 * it slightly differently — which is how "you have 0 credits" ends up on one
 * page while another says "unlimited".
 *
 * SIDEBAR 2026-08-30: wrapped in React cache(), matching getProfile() and
 * getUser() in lib/auth.js. The Free plan card moved into <Sidebar>, so this is
 * now asked twice per request — once by the sidebar and once by the page
 * rendering beside it. cache() keys on userId and collapses those into one pair
 * of queries; without it, moving that card would have doubled the database work
 * on every dashboard route.
 *
 * `unlimited` is computed the same way the database does it in
 * wallet_is_unlimited(): an active or past-due subscription whose period has not
 * ended. past_due still counts, because Stripe retries a failed payment for days
 * and cutting someone off over a card that will probably clear is the wrong
 * trade.
 */
export const getEntitlement = cache(async (userId) => {
  const supabase = await createClient()

  const [{ data: wallet }, { data: licenses }] = await Promise.all([
    supabase.from('credit_wallets').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('licenses').select('*').eq('user_id', userId).eq('status', 'active')
      .order('created_at', { ascending: false }),
  ])

  const minutes = wallet?.minutes_balance ?? 0
  const periodEnd = wallet?.subscription_period_end ? new Date(wallet.subscription_period_end) : null

  const unlimited =
    !!wallet?.subscription_kind &&
    ['active', 'past_due'].includes(wallet.subscription_status) &&
    !!periodEnd && periodEnd > new Date()

  return {
    wallet,
    license: licenses?.[0] ?? null,
    minutes,
    spentTotal: wallet?.minutes_spent_total ?? 0,
    unlimited,
    subscriptionKind:   wallet?.subscription_kind ?? null,
    subscriptionStatus: wallet?.subscription_status ?? null,
    periodEnd,

    // Nobody has bought anything yet and they are still inside the signup
    // grant. This is the state the "Free Plan" card speaks to, and it is
    // deliberately narrower than "balance is small" — someone who bought an
    // hour and used most of it is a customer, not a trial user.
    onFreePlan: !unlimited && (wallet?.minutes_spent_total ?? 0) + minutes <= 10,
  }
})
