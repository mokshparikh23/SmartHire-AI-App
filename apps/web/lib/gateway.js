import { razorpayConfigured } from '@/lib/razorpay'

/**
 * Which payment gateway takes the money, given the currency the page already
 * resolved.
 *
 *     INR  -> razorpay   UPI, net banking, cards, wallets
 *     else -> stripe     international cards
 *
 * DERIVED FROM CURRENCY, NEVER FROM THE CLIENT — for exactly the reason spelled
 * out in the SECURITY note on resolveCurrency() in lib/pricing.js. Currency
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
export function gatewayFor(currency) {
  if (currency === 'INR' && razorpayConfigured()) return 'razorpay'
  return 'stripe'
}

/** Human name, for error copy and the billing history. */
export const GATEWAY_LABEL = {
  stripe: 'Stripe',
  razorpay: 'Razorpay',
}
