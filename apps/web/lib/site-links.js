/**
 * Links from the product app back out to the marketing site.
 *
 * SPLIT 2026-09-01: the mirror of apps/site/lib/app-links.js, and much shorter,
 * because traffic mostly runs the other way.
 *
 * `/` on this origin does 308 to the marketing site (see redirects() in
 * next.config.mjs), so a bare href="/" would still arrive in the right place.
 * These exist so it arrives in one hop rather than two, and so the intent is
 * legible at the call site: "the marketing home", not "the root of whatever
 * this deployment is".
 *
 * NEXT_PUBLIC_ because the sidebar and the auth layout render in the browser.
 * 127.0.0.1:3001 is the site's dev port — see apps/site/package.json for why it
 * is 3001 and not 3000.
 */
const WWW_ORIGIN = (process.env.NEXT_PUBLIC_WWW_URL || 'http://127.0.0.1:3001').replace(/\/$/, '')

export function wwwUrl(path = '/') {
  return `${WWW_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}

export const MARKETING_HOME = wwwUrl('/')
export const PRICING = wwwUrl('/pricing')
