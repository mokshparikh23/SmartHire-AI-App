import Stripe from 'stripe'

/**
 * Stripe client.
 *
 * Lazily constructed rather than created at module scope, so importing anything
 * from this file does not throw during a build on a machine with no Stripe key
 * set. Checkout is the only thing that needs one, and it fails loudly at request
 * time instead.
 *
 * Prices are NOT stored in Stripe. lib/pricing.js is the single source of truth
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

/** Where Stripe sends the customer back. Falls back to the request's own origin
 *  so local development works without configuring anything. */
export function siteUrl(request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/$/, '')
  try {
    return new URL(request.url).origin
  } catch {
    return 'http://localhost:3000'
  }
}
