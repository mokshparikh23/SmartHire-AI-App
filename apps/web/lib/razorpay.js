import crypto from 'node:crypto'
import { priceOf } from 'smarthire-pricing'

/**
 * Razorpay, for the INR half of checkout.
 *
 * WHY THERE IS NO `razorpay` DEPENDENCY. The official package is a thin wrapper
 * over a REST API with HTTP Basic auth, plus one HMAC helper. Everything this
 * file needs is `fetch` and `node:crypto`, both of which are already in the
 * runtime, so the package would add a dependency to the payment path in exchange
 * for nothing. The one piece worth being careful about — webhook signature
 * verification — is implemented below with a constant-time compare, which is the
 * part a hand-rolled version usually gets wrong.
 *
 * MONEY UNITS. Razorpay takes amounts in the minor unit (paise), which is what
 * packages/pricing already stores. No conversion happens anywhere in this file,
 * deliberately: a `/100` here is how a customer gets charged a hundredth of the
 * price, and the absence of one is easier to review than its correctness.
 *
 * Lazily configured, like lib/stripe.js. Importing this must not throw on a
 * machine with no keys set, because the build imports every route.
 */

const API = 'https://api.razorpay.com/v1'

/*
  SPLIT 2026-09-01: razorpayConfigured() moved to packages/pricing/gateway and
  is called razorpayLive() there.

  Its only caller was gatewayFor(), and gatewayFor() had to move: /compare now
  renders on the marketing deployment, which has no checkout and must not hold
  RAZORPAY_KEY_SECRET just to decide whether a table row says "UPI" or "not
  yet". The replacement answers from the keys where they exist and from a plain
  flag where they do not — the reasoning is written out in that file.

  Nothing here needs it back. auth() below is the real guard on every REST call,
  and it throws with the variable names in the message rather than returning a
  boolean nobody checked.

  // export function razorpayConfigured() {
  //   return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
  // }
*/

function auth() {
  const id = process.env.RAZORPAY_KEY_ID
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!id || !secret) {
    throw new Error('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set on the server')
  }
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
}

export function getRazorpayWebhookSecret() {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) throw new Error('RAZORPAY_WEBHOOK_SECRET is not set on the server')
  return secret
}

/**
 * One REST call.
 *
 * Razorpay reports failures as 4xx with `{ error: { description } }`. That
 * description is surfaced because it is usually the actionable part ("plan does
 * not exist", "amount must be at least 100"), and the caller decides whether it
 * reaches a customer.
 */
async function rzp(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: auth(),
      ...(body ? { 'Content-Type': 'application/json' } : null),
    },
    ...(body ? { body: JSON.stringify(body) } : null),
    // Payments must never be served from a cache, and Next patches fetch.
    cache: 'no-store',
  })

  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Razorpay ${method} ${path} returned non-JSON (${res.status})`)
  }

  if (!res.ok) {
    const detail = data?.error?.description || data?.error?.reason || res.statusText
    // DELETE-ACCOUNT 2026-09-01: the status and the description are attached as
    // PROPERTIES as well as interpolated into the message. Purely additive —
    // every existing caller reads only `.message` — and cancelSubscription()
    // below needs it: it has to tell "this mandate is already cancelled" from
    // "Razorpay is down", and the difference decides whether someone's account
    // gets destroyed. Regex-ing a sentence Razorpay is free to reword is not a
    // way to make that call.
    //
    // throw new Error(`Razorpay ${method} ${path} failed (${res.status}): ${detail}`)
    throw Object.assign(
      new Error(`Razorpay ${method} ${path} failed (${res.status}): ${detail}`),
      { status: res.status, rzpCode: data?.error?.code ?? null, description: detail },
    )
  }
  return data
}

/* ───────────────────────────────────────────────────────────── one-time buys */

/**
 * A hosted payment page for a credit pack.
 *
 * PAYMENT LINKS, NOT CHECKOUT.JS. Razorpay's usual integration is a browser
 * modal that needs its script tag, an order id and a client-side handler. A
 * Payment Link is created server-side and returns a `short_url` to redirect to —
 * the same shape Stripe Checkout returns, which is why PricingPlans.jsx did not
 * have to change at all. It also means the amount is never in the client's
 * hands, which is the property that matters on this path.
 *
 * `callback_url` is where the customer comes BACK to, and it is not evidence of
 * anything. A user who closes the tab still paid, and a user who reaches the
 * callback may not have. Credits are granted by the webhook, only ever there.
 */
export function createPaymentLink({ amountMinor, currency, description, email, notes, callbackUrl }) {
  return rzp('/payment_links', {
    method: 'POST',
    body: {
      amount: amountMinor,
      currency,
      description: description.slice(0, 2048),
      customer: email ? { email } : undefined,
      // Razorpay would otherwise email and SMS the customer a link they did not
      // ask for. They are already looking at the page it opens.
      notify: { sms: false, email: false },
      reminder_enable: false,
      callback_url: callbackUrl,
      callback_method: 'get',
      notes,
    },
  })
}

/* ─────────────────────────────────────────────────────────── subscriptions */

/**
 * How many billing cycles to authorise up front.
 *
 * Razorpay requires `total_count`; there is no "until cancelled". These are
 * roughly ten years of each period, which is longer than this product's likely
 * life and far longer than any subscriber's. When the count runs out Razorpay
 * emits `subscription.completed` and the webhook clears the subscription, so the
 * failure mode at the end is "it lapses", not "it silently keeps charging".
 */
const TOTAL_COUNT = { weekly: 520, monthly: 120, yearly: 10 }

/** Plan ids are created once in the Razorpay dashboard and named here. */
export function planIdFor(kind) {
  const id = {
    weekly:  process.env.RAZORPAY_PLAN_WEEKLY,
    monthly: process.env.RAZORPAY_PLAN_MONTHLY,
    yearly:  process.env.RAZORPAY_PLAN_YEARLY,
  }[kind]
  if (!id) throw new Error(`No Razorpay plan configured for the ${kind} tier`)
  return id
}

/**
 * Reads a plan back and refuses it if its amount disagrees with packages/pricing.
 *
 * THIS IS THE POINT OF THE FUNCTION. A Razorpay plan carries its own amount, set
 * in their dashboard, so for the first time in this codebase a price exists
 * somewhere other than packages/pricing — exactly the drift lib/stripe.js avoids by
 * sending inline price_data. There is no way to avoid it (Subscriptions require
 * a plan), so it is checked instead: one extra API call per subscription
 * checkout, and a loud failure rather than a customer charged an amount the site
 * never showed them.
 *
 * Failing closed is deliberate. A mismatch means someone edited a price in one
 * of two places, and guessing which one is right is not a decision to make while
 * a buyer waits.
 */
export async function assertPlanMatchesPricing(planId, { kind, currency }) {
  const plan = await rzp(`/plans/${encodeURIComponent(planId)}`)
  const expected = priceOf(`sub_${kind}`, currency)
  const actual = plan?.item?.amount

  if (typeof actual !== 'number' || actual !== expected) {
    throw new Error(
      `Razorpay plan ${planId} is ${actual} ${plan?.item?.currency} but packages/pricing ` +
      `says the ${kind} tier is ${expected} ${currency}. Fix one of them before charging anyone.`,
    )
  }
  if (plan?.item?.currency && plan.item.currency !== currency) {
    throw new Error(`Razorpay plan ${planId} is in ${plan.item.currency}, not ${currency}`)
  }
  return plan
}

/**
 * A subscription with its own hosted authorisation page.
 *
 * `short_url` is where the customer sets up the mandate — UPI Autopay, a card
 * mandate or net-banking e-mandate, whichever they pick there. Returning it
 * keeps this path the same shape as the credit-pack path above.
 */
export function createSubscription({ planId, kind, email, notes }) {
  return rzp('/subscriptions', {
    method: 'POST',
    body: {
      plan_id: planId,
      total_count: TOTAL_COUNT[kind] ?? 12,
      // Razorpay's own email/SMS about the mandate. Left ON here, unlike the
      // payment link above: an e-mandate is a standing authorisation against the
      // customer's bank, and a record of it arriving in their inbox is
      // reasonable rather than noise.
      customer_notify: 1,
      notes,
      ...(email ? { notify_info: { notify_email: email } } : null),
    },
  })
}

/** Reads a subscription back — the webhook needs its period end. */
export const fetchSubscription = (id) => rzp(`/subscriptions/${encodeURIComponent(id)}`)

/**
 * Cancel a subscription NOW.
 *
 * `cancel_at_cycle_end: 0` is the whole call, and it is the most consequential
 * line in this file. Razorpay's other mode lets the current cycle run out, and an
 * account that is about to stop existing has nobody left to serve it to — but the
 * real reason is TOTAL_COUNT above. A monthly subscription is created with 120
 * cycles. A mandate left standing is a UPI Autopay or e-mandate authorisation
 * against a real bank account that keeps debiting monthly FOR TEN YEARS, with no
 * row left to attribute the charges to and no webhook able to write anything, and
 * the customer's only recourse is their bank. That is the failure this function
 * exists to prevent.
 *
 * ALREADY-CANCELLED AND NOT-FOUND ARE SUCCESS, and that is not leniency — it is
 * what makes the delete route retryable. Razorpay answers both with a 4xx
 * carrying a description. A caller that treated them as failures could never
 * finish a half-completed deletion: the second attempt would fail on the mandate
 * the first attempt had already cancelled, and the account would be permanently
 * undeletable. Everything else propagates, because "Razorpay is down" and "the
 * mandate is gone" must not be the same answer.
 */
const GONE = /already\s*(been\s*)?cancell?ed|does not exist|not\s*found|no\s*such|not\s*cancellable|already\s*(been\s*)?completed|already\s*expired/i

export async function cancelSubscription(id) {
  if (!id) return { ok: true, alreadyGone: true }
  try {
    const sub = await rzp(`/subscriptions/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: { cancel_at_cycle_end: 0 },
    })
    return { ok: true, alreadyGone: false, status: sub?.status ?? 'cancelled' }
  } catch (e) {
    // Only a 4xx can mean "gone". A 5xx whose body happens to match GONE is
    // Razorpay failing, and reading that as a cancelled mandate is how a live
    // mandate outlives the account it belonged to.
    if (e?.status >= 400 && e?.status < 500 && GONE.test(e.description || e.message || '')) {
      return { ok: true, alreadyGone: true }
    }
    throw e
  }
}

/* ─────────────────────────────────────────────────────────────── webhooks */

/**
 * Verifies `x-razorpay-signature` against the raw request body.
 *
 * Razorpay signs the exact bytes it sent with HMAC-SHA256 and the webhook
 * secret, hex encoded. Two things here are load-bearing:
 *
 *   - The RAW body. Parsing and re-stringifying changes key order and
 *     whitespace, and the digest with it. The route reads text() first.
 *   - timingSafeEqual, not `===`. A plain string compare returns early on the
 *     first differing byte, which leaks how much of a guessed signature was
 *     right. It also throws on length mismatch, hence the length check first.
 */
export function verifyWebhookSignature(rawBody, signature) {
  if (typeof signature !== 'string' || !signature) return false

  const expected = crypto
    .createHmac('sha256', getRazorpayWebhookSecret())
    .update(rawBody, 'utf8')
    .digest('hex')

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
