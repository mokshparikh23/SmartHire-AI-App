/**
 * Validation for the `?next=` redirect target.
 *
 * SPLIT 2026-09-01 ─────────────────────────────────────────────────────────────
 *
 * WHY THIS EXISTS NOW AND NOT BEFORE. `app/auth/callback/route.js` has always
 * read `?next=` and redirected to `${origin}${next}` without checking it. That
 * was unreachable rather than safe: a grep for `next=` across app/, components/
 * and lib/ returned exactly one hit, and it was the COMMENT in PricingPlans.jsx
 * explaining why the parameter was not used. Nothing ever set one.
 *
 * The marketing split changes that. smarthire.ai now deep-links into
 * app.smarthire.ai/dashboard/billing?plan=…, proxy.js carries that destination
 * through /login?next=…, and signup carries it through the confirmation email.
 * The parameter is now attacker-supplyable from a page on another origin, so it
 * has to be checked.
 *
 * `${origin}${next}` LOOKS SAFE AND IS NOT. Prepending the origin feels like it
 * pins the host, and for most inputs it does. It does not for these:
 *
 *     next=@evil.com    ->  https://app.smarthire.ai@evil.com
 *                           everything before the @ is USERINFO. The host is
 *                           evil.com, and the URL reads as though it is ours.
 *     next=//evil.com   ->  https://app.smarthire.ai//evil.com
 *                           harmless here, because the origin is already
 *                           present — but it is a protocol-relative URL the
 *                           moment anyone builds a redirect without the origin,
 *                           which is one refactor away. Rejected too.
 *     next=\evil.com    ->  browsers normalise a backslash to a forward slash
 *                           in the authority position. Same problem as above.
 *
 * So the rule is a whitelist, not a blacklist: ONE leading slash, and the
 * character after it is neither a slash nor a backslash. Everything else — a
 * scheme, a bare word, an empty string, a non-string — comes back null and the
 * caller uses its own default.
 *
 * Deliberately dependency-free and framework-free so it can be imported from a
 * route handler, from proxy.js and from the 'use client' AuthForm without
 * dragging any of those three into each other.
 */

/**
 * @param {unknown} value  the raw `next` search param
 * @returns {string|null}  a same-origin absolute path, or null if unusable
 */
export function safeNext(value) {
  if (typeof value !== 'string') return null
  // One leading slash, and not the start of an authority. Covers "//host",
  // "/\host" and "\host"; a scheme ("https:…") and a bare word never match at
  // all, because both fail the leading-slash test.
  if (!/^\/(?!\/|\\)/.test(value)) return null
  return value
}

/**
 * The current path plus its query, in the shape `next` expects.
 *
 * Used by proxy.js and requireUser() when bouncing to /login, so that whatever
 * the visitor was reaching for survives the sign-in. `search` already carries
 * its own leading '?' or is empty, so it concatenates directly.
 *
 * @param {string} pathname
 * @param {string} [search]
 */
export function nextParamFor(pathname, search = '') {
  return `${pathname}${search}`
}
