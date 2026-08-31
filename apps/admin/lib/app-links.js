/**
 * ADMIN SPLIT 2026-09-01 ─ links from the admin origin back to the app.
 *
 * The mirror of apps/site/lib/app-links.js, and its header is the long version
 * of the two rules that matter — read it. The short version:
 *
 *   1. NEVER next/link ACROSS AN ORIGIN. next/navigation's router cannot
 *      navigate off-origin, so a <Link href={APP_ORIGIN + '/dashboard'}> does
 *      nothing when clicked and prefetches an origin it cannot render.
 *      packages/ui's Button already regex-tests /^(https?:|mailto:|tel:|#)/ on
 *      href and drops to a plain anchor, so <Button href={DASHBOARD}> is correct
 *      — but only because these values are ABSOLUTE. That is why appUrl()
 *      returns null rather than a path when the origin is unset: a relative
 *      '/dashboard' would look fine, render as a next/link, and 404 on this
 *      origin.
 *
 *   2. NEXT_PUBLIC_, and set at BUILD time. Anything that reads this in the
 *      browser needs the value inlined; a runtime-only variable is how a
 *      prerendered page ships pointing at localhost with nothing erroring.
 *
 * ONE DELIBERATE DIFFERENCE FROM apps/site: no `|| 'http://localhost:3000'`
 * fallback.
 *
 * On the marketing site that fallback is right — dev has to work, and a site
 * whose every CTA points nowhere is useless. Here the only consumer is the
 * sidebar's "Back to my dashboard", which is optional chrome. NEXT_PUBLIC_APP_URL
 * is not one of the three variables this deployment requires (see
 * .env.local.example), so unset is a legitimate production state, and a
 * hardcoded localhost default shipped into it would be a dead link sitting in
 * the admin UI forever. Callers render the link only when this is truthy.
 */
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || null

/** Absolute URL on the app origin, or null when it is not configured. */
export function appUrl(path = '/') {
  if (!APP_ORIGIN) return null
  return `${APP_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}

export { APP_ORIGIN }
export const DASHBOARD = appUrl('/dashboard')
