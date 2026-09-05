/*
  SPLIT 2026-09-01: this was apps/dashboard/lib/pricing.js. It moved here unchanged.

  WHY IT IS A PACKAGE AND NOT A SECOND COPY. The line below says this file is
  the only place prices live. The marketing site is a separate deployment on a
  separate domain now — it quotes a price, and apps/dashboard charges one. A copied
  file would keep that comment technically present and actually false: two price
  tables that agree until the day somebody edits one of them, and the way you
  find out is a customer being charged something other than the number they read.

  ZERO DEPENDENCIES AND ZERO PEER DEPENDENCIES, deliberately. No react, no next,
  nothing. That is what would let apps/desktop — React 18 and Vite, pinned there
  on purpose; see the version note in the root README — import this one day
  without npm resolving a second React into the tree.
*/

/**
 * What Smart Hire AI sells, and for how much.
 *
 * Two products, side by side on the pricing page:
 *
 *   SUBSCRIPTION  Weekly, monthly or yearly. Unlimited call time — a subscriber
 *                 is not metered at all.
 *   CREDITS       1 credit = 1 hour of live interview time, metered per minute.
 *                 The remainder stays in the account and never expires.
 *
 * Every amount below is in the currency's MINOR unit (paise, cents) and is an
 * integer, because that is what Stripe charges in and because float money is
 * how rounding bugs start.
 *
 * This file is the ONLY place prices live. Changing one here changes the
 * marketing page, the dashboard and checkout together.
 */

// ─────────────────────────────────────────────────────────── credit packs
//
// `credits` is what the customer pays for; `bonus` is what they get on top.
// A "6 credits +2 free" pack delivers 8 hours, and the per-hour figure shown to
// the buyer divides by the total — that discount is the reason to buy up.
export const CREDIT_PACKS = [
  { id: 'credit_3', credits: 3, bonus: 0 },
  { id: 'credit_6', credits: 6, bonus: 2, featured: true },
  { id: 'credit_9', credits: 9, bonus: 6 },
]

/**
 * The single credit sits outside the ladder, as the "or, just need one call?"
 * line under the pack list. It is deliberately the worst per-hour rate: it
 * exists so nobody bounces off the page for want of a small option, not to be
 * chosen.
 */
export const SINGLE_CREDIT_PACK = { id: 'credit_1', credits: 1, bonus: 0 }

export const ALL_CREDIT_PACKS = [SINGLE_CREDIT_PACK, ...CREDIT_PACKS]

// ─────────────────────────────────────────────────────────── subscriptions
//
// Unlimited call time for the length of the period. Ordered cheapest-commitment
// first, which is also how they are stacked on the page.
export const SUBSCRIPTION_TIERS = [
  { id: 'sub_weekly',  kind: 'weekly',  label: 'Weekly',  per: 'Week'  },
  { id: 'sub_monthly', kind: 'monthly', label: 'Monthly', per: 'Month', featured: true, badge: 'Most popular' },
  { id: 'sub_yearly',  kind: 'yearly',  label: 'Yearly',  per: 'Year',  badge: 'Best value' },
]

export const PACK_BY_ID = Object.fromEntries(
  [...ALL_CREDIT_PACKS, ...SUBSCRIPTION_TIERS].map(p => [p.id, p]),
)

// ─────────────────────────────────────────────────────────── prices
//
// INR is the reference currency — these are the numbers the product was priced
// at. USD is converted and rounded, and is worth a second look before launch.
export const PRICE_TABLE = {
  INR: {
    currency: 'INR', locale: 'en-IN',
    credit_1:    236000,   // ₹2,360
    credit_3:    369000,   // ₹3,690   ₹1,230 / credit
    credit_6:    738000,   // ₹7,380   ₹922.50 / credit across 8
    credit_9:   1107000,   // ₹11,070  ₹738 / credit across 15
    sub_weekly:  498000,   // ₹4,980
    sub_monthly: 947000,   // ₹9,470
    sub_yearly: 3790000,   // ₹37,900
  },
  USD: {
    currency: 'USD', locale: 'en-US',
    credit_1:     2900,    // $29
    credit_3:     4500,    // $45
    credit_6:     8900,    // $89
    credit_9:    12900,    // $129
    sub_weekly:   5900,    // $59
    sub_monthly: 10900,    // $109
    sub_yearly:  44900,    // $449
  },
}

export const DEFAULT_CURRENCY = 'USD'

/** Which currency a country pays in. Everything outside India pays USD. */
const CURRENCY_BY_COUNTRY = { IN: 'INR' }

/**
 * Reads the visitor's country from the platform's geo headers.
 *
 * Netlify sends x-nf-geo (base64 JSON); Vercel's and Cloudflare's are accepted
 * too so this keeps working if the host changes. Local dev sends none of them,
 * which falls through to the default.
 *
 * @param {Headers} headers - from next/headers. Server-side only.
 */
export function resolveCountry(headers) {
  const nfGeo = headers?.get?.('x-nf-geo')
  if (nfGeo) {
    try {
      const geo = JSON.parse(Buffer.from(nfGeo, 'base64').toString('utf8'))
      const code = geo?.country?.code
      if (typeof code === 'string' && code.length === 2) return code.toUpperCase()
    } catch {
      // A malformed header is not worth failing a page render over.
    }
  }

  for (const name of ['x-country', 'x-vercel-ip-country', 'cf-ipcountry']) {
    const value = headers?.get?.(name)
    if (typeof value === 'string' && value.length === 2) return value.toUpperCase()
  }
  return null
}

/**
 * SECURITY: currency is resolved from request headers and NEVER from the request
 * body. If the client could name its own currency, anyone would post
 * `currency: 'INR'` and pay the Indian price. Both the pricing page and
 * /api/checkout call this, so the two cannot disagree.
 *
 * A VPN still defeats geo-pricing. That is accepted, and true of every
 * geo-priced product.
 *
 * SPLIT 2026-09-01 ─ THE INVARIANT NOW SPANS TWO DEPLOYMENTS.
 *
 * "Both the pricing page and /api/checkout call this, so the two cannot
 * disagree" was a statement about one server. The pricing page is on
 * smarthire.ai and the checkout route is on app.smarthire.ai, and each resolves
 * from its OWN request's headers. That is still correct — same visitor, same
 * visit, same country — but only while three things hold:
 *
 *   1. BOTH APPS ON THE SAME PLATFORM. This function reads x-nf-geo first, then
 *      x-vercel-ip-country, then cf-ipcountry. Site on Netlify and app on Vercel
 *      means two different geo databases, and a border case shows one currency
 *      and charges the other.
 *   2. THE SAME EDGE IN FRONT OF BOTH. x-vercel-ip-country is checked BEFORE
 *      cf-ipcountry, so one host proxied through Cloudflare and one not means
 *      Vercel geolocating Cloudflare's edge IP on one of them and winning the
 *      precedence order with it.
 *   3. NO SHARED CACHING ON ANY PAGE THAT CALLS THIS. Reading headers() forces
 *      dynamic rendering today, which is what keeps it honest. A marketing site
 *      is exactly where somebody adds `export const revalidate` or an s-maxage
 *      header for Core Web Vitals — and then one country's price is served to
 *      another while checkout charges the real one. If a page here ever needs
 *      caching, Vary on the geo header or move the price into a per-request
 *      island. Do not cache the page.
 */
export function resolveCurrency(headers) {
  const country = resolveCountry(headers)
  const currency = country ? CURRENCY_BY_COUNTRY[country] : null
  return PRICE_TABLE[currency] ? currency : DEFAULT_CURRENCY
}

function table(currency) {
  return PRICE_TABLE[currency] || PRICE_TABLE[DEFAULT_CURRENCY]
}

/** Minor units for one pack or tier, or null if the id is unknown. */
export function priceOf(id, currency) {
  const amount = table(currency)[id]
  return typeof amount === 'number' ? amount : null
}

/** '₹7,380' / '$89'. Whole units — none of these prices have a fractional part. */
export function formatMoney(amountMinor, currency) {
  const t = table(currency)
  return new Intl.NumberFormat(t.locale, {
    style: 'currency', currency: t.currency, maximumFractionDigits: 0,
  }).format((amountMinor || 0) / 100)
}

/**
 * '₹922.50' — the per-credit figure, to two places because that is where the
 * discount actually shows up. Divides by TOTAL credits including the bonus,
 * which is the whole point of the bonus.
 */
export function formatPerCredit(amountMinor, totalCredits, currency) {
  const t = table(currency)
  return new Intl.NumberFormat(t.locale, {
    style: 'currency', currency: t.currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format((amountMinor || 0) / 100 / Math.max(1, totalCredits))
}

/** A credit pack with its price and totals worked out, ready to render. */
export function resolvePack(pack, currency) {
  const amountMinor = priceOf(pack.id, currency)
  const totalCredits = pack.credits + pack.bonus
  return {
    ...pack,
    totalCredits,
    amountMinor,
    currency,
    price: formatMoney(amountMinor, currency),
    perCredit: formatPerCredit(amountMinor, totalCredits, currency),
  }
}

export const packsForCurrency = (currency) => CREDIT_PACKS.map(p => resolvePack(p, currency))
export const singlePackForCurrency = (currency) => resolvePack(SINGLE_CREDIT_PACK, currency)

/**
 * A subscription tier with its price, plus the monthly-equivalent line that
 * makes the weekly tier's real cost — and the yearly tier's saving — legible.
 * A buyer comparing "₹4,980 a week" with "₹9,470 a month" cannot do that
 * arithmetic in their head, and should not have to.
 */
export function resolveTier(tier, currency) {
  const amountMinor = priceOf(tier.id, currency)
  const perMonth =
    tier.kind === 'weekly' ? Math.round(amountMinor * 52 / 12) :
    tier.kind === 'yearly' ? Math.round(amountMinor / 12) :
    null

  return {
    ...tier,
    amountMinor,
    currency,
    price: formatMoney(amountMinor, currency),
    perMonth: perMonth == null ? null : formatMoney(perMonth, currency),
    perMonthApprox: tier.kind === 'weekly',
  }
}

export const tiersForCurrency = (currency) => SUBSCRIPTION_TIERS.map(t => resolveTier(t, currency))

/** How long a paid period runs. Mirrors what Stripe will report on renewal. */
export const SUBSCRIPTION_DAYS = { weekly: 7, monthly: 30, yearly: 365 }
