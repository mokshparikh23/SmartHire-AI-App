/**
 * Links from the marketing site into the product app.
 *
 * SPLIT 2026-09-01 ─────────────────────────────────────────────────────────────
 *
 * This site is on the root domain and the app is on app.<domain>. So every
 * "Log in", "Get started", "Dashboard" and download link is cross-origin now,
 * and every one of them has to be built from a variable rather than written as
 * a literal — the origin differs between local development, a preview deploy
 * and production.
 *
 * NEXT_PUBLIC_ IS REQUIRED, NOT A HABIT. PricingPlans is a 'use client'
 * component and reads the origin in the browser, so the value has to be inlined
 * at build time. Drop the prefix and it is `undefined` in the bundle and every
 * Buy button navigates to "undefined/dashboard/billing".
 *
 * THESE ARE PLAIN ANCHORS, NEVER next/link. Two reasons, and the first is a
 * hard error rather than a preference:
 *
 *   1. next/navigation's router cannot navigate cross-origin. `router.push` to
 *      another origin does not work — it either does nothing or resolves the
 *      path against this site and 404s. Anything leaving for the app has to be
 *      a real navigation: an <a href> or window.location.
 *   2. Prefetching another origin is meaningless, and next/link would try.
 *
 * The good news is that no call site has to think about it. The shared Button
 * already tests `/^(https?:|mailto:|tel:|#)/` on its href and sends anything
 * matching down the plain-anchor path — see the PIVOT note above `external` in
 * packages/ui/src/index.jsx. So `<Button href={SIGNUP}>` renders an <a> with no
 * change to Button at all. Only SiteChrome's footer, which calls Link
 * unconditionally, has to branch.
 *
 * 127.0.0.1 rather than localhost in the default, to match apps/desktop/.env and
 * the root README: Electron's main process resolves localhost to ::1 and will
 * not fall back to IPv4. Nothing here runs in Electron, but having one spelling
 * of "the local app" across the repo is worth more than the two characters.
 */
const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')

/** An absolute URL on the product app. */
export function appUrl(path = '/') {
  return `${APP_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}

export const LOGIN     = appUrl('/login')
export const SIGNUP    = appUrl('/signup')
export const DASHBOARD = appUrl('/dashboard')

/**
 * Where a Buy button goes.
 *
 * NOT a fetch. The old flow POSTed to /api/checkout from this component, which
 * cannot work across the origin boundary: apps/web sends
 * `Access-Control-Allow-Origin: *` — it has to, because the packaged Electron
 * renderer connects from file:// with origin `null`, which no allowlist can
 * match — and browsers reject `*` outright for a credentialed request. The
 * alternatives were widening the Supabase auth cookie to the apex domain and
 * setting SameSite=None on it, which is three security downgrades on the
 * highest-value endpoint in the product to save one page load.
 *
 * So the pack id travels in a URL and the app, which holds the session, does
 * the rest. Never a currency and never an amount: /dashboard/billing resolves
 * currency from its own request's geo headers, exactly as /api/checkout does.
 * See the SECURITY note in packages/pricing.
 *
 * /dashboard/billing rather than /signup, deliberately — it is the only target
 * that is right for both visitor states. proxy.js already guards
 * /dashboard/:path* and now carries the destination through /login and through
 * the signup confirmation email. A signed-in returning customer sent to /signup
 * would be bounced to a bare /dashboard, losing the plan.
 */
export function checkoutUrl(packId) {
  return appUrl(`/dashboard/billing?plan=${encodeURIComponent(packId)}`)
}

/**
 * The desktop build for a platform — 'mac' or 'win', the only two
 * apps/web/lib/releases.js recognises. It 302s to the current GitHub release
 * asset, and it is deliberately NOT session-gated; the comment on that route
 * says so, and says the reason is a marketing site linking to it.
 */
export function downloadUrl(platform) {
  return appUrl(`/api/download/${platform}`)
}
