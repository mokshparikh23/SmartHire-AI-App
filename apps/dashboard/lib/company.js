/**
 * RESUME-UPLOAD 2026-08-30
 *
 * Company lookup for the Interviews form, via Brandfetch.
 *
 * WHY THIS RUNS IN THE BROWSER AND NOT BEHIND A ROUTE. Every instinct in this
 * repo says to proxy a third-party API server-side — lib/ai.js is explicit that
 * "anything shipped to a client is extractable, which is the whole reason these
 * routes exist". That reasoning does not carry over, for three reasons, and the
 * middle one is decisive:
 *
 *   1. The `c` parameter is a CLIENT ID, not a secret. Brandfetch's own
 *      guidelines say "your users should make requests to the API directly from
 *      their browsers". The Bearer-token API is a different, paid product.
 *   2. THE RATE LIMIT IS PER IP — 200 requests per 5 minutes. Proxying would put
 *      every user of this product behind one server IP and share a single
 *      bucket, so a handful of people typing at once would throttle everybody.
 *      Direct from the browser, each user gets their own allowance.
 *   3. Their guidelines forbid caching brand data, which removes the other
 *      reason a proxy would earn its keep.
 *
 * TWO URLS, TWO LIFETIMES — this is the part that is easy to get wrong. The
 * `icon` on a search result is EPHEMERAL: Brandfetch documents those URLs as
 * expiring after 24 hours, and forbids storing them. So a search icon is fine to
 * render in the open dropdown and must never reach the database. What gets
 * stored is the DOMAIN, and logoUrl() below rebuilds a stable CDN URL from it on
 * every render.
 */

const CLIENT_ID = process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID

/** Without a client id the field silently becomes a plain text input. */
export const companyLookupEnabled = () => Boolean(CLIENT_ID)

/**
 * A stable logo URL for a stored domain.
 *
 * /fallback/404/ so an unknown domain fails the <img> and hits CompanyLogo's
 * initial-letter placeholder, instead of rendering Brandfetch's own substitute
 * glyph next to a candidate's name — which looks like our bug, not their miss.
 *
 * Hotlinked, never re-hosted and never run through next/image: their terms
 * require the CDN to serve it, and the optimiser would mean a remotePatterns
 * entry and a round trip for a 24px image.
 */
export function logoUrl(domain, px = 64) {
  if (!domain || !CLIENT_ID) return null
  /* BUGFIX 2026-09-01: `fallback` is a PATH segment, never a query parameter.
     Sitting in the query string it was silently ignored — Brandfetch documents
     that "an unrecognized fallback value becomes the default" — so an unknown
     domain answered 200 with a blank white icon rather than the 404 this
     function has always meant to ask for. The <img> therefore never fired
     onError, CompanyLogo's initial-letter placeholder was unreachable, and the
     row showed an empty box beside the company name: exactly the "our bug, not
     their miss" outcome the note above exists to prevent.

     Brandfetch's own search results are what give the correct shape away —
     their icons come back as .../w/128/h/128/fallback/lettermark/icon.webp.
     Verified against the CDN: the path form 404s on an unknown domain, the
     query form returns a 318-byte blank. */
  // return `https://cdn.brandfetch.io/${encodeURIComponent(domain)}` +
  //        `/w/${px}/h/${px}/icon?c=${encodeURIComponent(CLIENT_ID)}&fallback=404`
  return `https://cdn.brandfetch.io/${encodeURIComponent(domain)}` +
    `/w/${px}/h/${px}/fallback/404/icon?c=${encodeURIComponent(CLIENT_ID)}`
}

/**
 * Company suggestions for a typed name.
 *
 * Returns [] rather than throwing for every failure the user cannot act on — no
 * client id, a network wobble, a 429. The company field is a plain text input
 * that sometimes offers help; it must never be able to block a save, and a red
 * error under a field that otherwise works is worse than a missing dropdown.
 *
 * An aborted request is the one case that DOES throw, and the caller must
 * swallow it: every keystroke aborts the last one, so treating an abort as a
 * failure would flash an error row on each letter typed.
 */
export async function searchCompanies(query, { signal } = {}) {
  const q = (query || '').trim()
  if (!CLIENT_ID || q.length < 2) return []

  const res = await fetch(
    `https://api.brandfetch.io/v2/search/${encodeURIComponent(q)}?c=${encodeURIComponent(CLIENT_ID)}`,
    { signal, headers: { Accept: 'application/json' } },
  )
  if (!res.ok) return []

  const body = await res.json()
  if (!Array.isArray(body)) return []

  return body
    .filter((b) => b && typeof b.domain === 'string' && b.domain)
    .slice(0, 6)
    .map((b) => ({
      name: typeof b.name === 'string' && b.name ? b.name : b.domain,
      domain: b.domain,
      // Live only. Rendered in the open dropdown, never persisted — see the
      // header note on the 24-hour expiry.
      icon: typeof b.icon === 'string' && b.icon.startsWith('https://') ? b.icon : null,
    }))
}
