/*
  SPLIT 2026-09-01: this was apps/web/lib/gateway.js, and its first line was

      import { razorpayConfigured } from '@/lib/razorpay'

  which cannot survive the move — `@/` is an apps/web alias, and lib/razorpay.js
  is a payment client that has no business in a package apps/site imports.

  THE REAL PROBLEM IS NOT THE IMPORT, IT IS THE SECRET. /compare calls
  gatewayFor('INR') to decide whether the table shows UPI as live or as a
  caveat. razorpayConfigured() answered that by reading RAZORPAY_KEY_ID AND
  RAZORPAY_KEY_SECRET. So moving /compare to the marketing deployment as-is
  would mean putting a payment secret on a project that has no checkout, no
  session and no service role — to answer one boolean about one table row.

  So the check has two arms, and both live in this one function on purpose:

    apps/web  answers from the keys it already holds, exactly as before.
    apps/site answers from RAZORPAY_LIVE, a plain flag and not a credential.

  KEEP THEM TOGETHER. The alternative — a second `upiLive` constant over in
  apps/site — is a claim about the checkout written in a codebase that cannot
  see the checkout, and it would be the first thing to rot.

  WHAT THIS TRADE COSTS: the two can now drift by one env var. Set RAZORPAY_LIVE
  on the site and forget the keys on the app, and /compare says UPI is available
  while checkout quietly falls back to Stripe. That is one inaccurate cell, not a
  wrong price, and it is recoverable by flipping a flag. Asking the marketing
  site to call the app over the network to find out was the other option, and it
  is not worth a request on every render of a comparison table.

  apps/web/lib/razorpay.js keeps its own razorpayConfigured() — it guards the
  actual REST calls, which is a different question from what the table shows.
*/

/** Is the INR gateway live on the deployment that will take the money? */
export function razorpayLive() {
  // The app: the keys are right here, so answer from them.
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) return true
  // The marketing site: no keys, and it must not have any. A flag instead.
  return process.env.RAZORPAY_LIVE === 'true'
}

/**
 * Which payment gateway takes the money, given the currency the page already
 * resolved.
 *
 *     INR  -> razorpay   UPI, net banking, cards, wallets
 *     else -> stripe     international cards
 *
 * DERIVED FROM CURRENCY, NEVER FROM THE CLIENT — for exactly the reason spelled
 * out in the SECURITY note on resolveCurrency() in ./index.js. Currency
 * comes from the request's geo headers, the gateway follows it, and a client
 * that cannot name its currency cannot name its gateway either. If it could, it
 * could pick the one whose price table is cheaper.
 *
 * THE FALLBACK IS THE INTERESTING PART. Until the Razorpay keys are actually set
 * on the deployment, an Indian buyer falls back to Stripe rather than meeting an
 * error — which is what lets this ship before the Razorpay account is live
 * without taking INR checkout down in the meantime. It also means the switch-on
 * is an environment change, not a deploy.
 *
 * The cost of that kindness: if the keys are accidentally removed from a live
 * deployment, INR checkout silently reverts to cards-only instead of failing
 * loudly. That is the right way round — a buyer who can still pay by card is a
 * better outcome than a buyer who cannot pay at all — but it is worth knowing
 * when "why is nobody using UPI" comes up.
 */
// if (currency === 'INR' && razorpayConfigured()) return 'razorpay'
export function gatewayFor(currency) {
  if (currency === 'INR' && razorpayLive()) return 'razorpay'
  return 'stripe'
}

/** Human name, for error copy and the billing history. */
export const GATEWAY_LABEL = {
  stripe: 'Stripe',
  razorpay: 'Razorpay',
}
