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
 * ── NEXT_PUBLIC_APP_URL MUST BE SET AT BUILD TIME, NOT ONLY AT RUNTIME ────────
 *
 * This bites in a way that is easy to miss because it only breaks SOME pages.
 * Verified against a real production build:
 *
 *     /  /pricing  /compare        dynamic (they read geo headers), so they
 *                                  resolve this at REQUEST time and pick up
 *                                  whatever the server has.
 *     /features  /how-it-works     static, so whatever was in the environment
 *                                  during `next build` is BAKED INTO THE HTML.
 *
 * So a deployment that sets this only in the runtime environment ships two of
 * five pages with every "Get started", "Log in" and footer link pointing at
 * localhost — while the other three look perfectly fine. Nothing errors, and
 * the pages that are checked first are the ones that work.
 *
 * Vercel and Netlify both expose project env vars to the build, so setting it
 * normally is enough. The failure mode is a var injected at runtime only, or a
 * build run before the variable was added. If two pages ever have the wrong
 * origin and three do not, this is why — rebuild, do not patch.
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
 * ── localhost, NOT 127.0.0.1, AND THAT IS NOT COSMETIC ───────────────────────
 *
 * The first version of this file used 127.0.0.1 for symmetry with
 * apps/desktop/.env, which has to use the IP because Electron's main process
 * runs Node and resolves localhost to ::1 without falling back. That reasoning
 * does not transfer, because the consumer here is a BROWSER, and it broke
 * sign-in in a way that looked like nothing at all:
 *
 *   `next dev` serves on localhost and treats any other host as cross-origin.
 *   So a browser that arrived at 127.0.0.1:3000 from a link here got the HTML
 *   fine and every /_next/static chunk BLOCKED — "Blocked cross-origin request
 *   to Next.js dev resource ... from 127.0.0.1".
 *
 *   With no JavaScript, React never hydrates, AuthForm's onSubmit never runs,
 *   and the sign-in form falls back to a native HTML submit:
 *       GET /login?email=...&password=...
 *   The page re-renders, nothing navigates, and the credentials end up in the
 *   URL bar, the browser history and the dev server log.
 *
 * There is a second, quieter reason. localhost and 127.0.0.1 are DIFFERENT
 * cookie origins, so signing in at one leaves you signed out at the other. Any
 * mix of the two across the site and the app splits the session in half.
 *
 * So: everything a browser follows uses localhost. apps/desktop keeps
 * 127.0.0.1, because Node is not a browser and its reason still holds. The two
 * differ on purpose — see the port note in apps/site/package.json.
 */
const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')

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
