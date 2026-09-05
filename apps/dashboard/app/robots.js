/*
  SPLIT 2026-09-01 ─ THIS FILE ALLOWS CRAWLING ON PURPOSE. DO NOT "FIX" IT.

  The instinct on an app subdomain is `Disallow: /`, and it is wrong here in two
  separate ways.

  1. DISALLOW PREVENTS CRAWLING, NOT INDEXING. A URL that is linked from
     somewhere else still gets indexed — as a bare, snippet-less result — and
     because the crawler is forbidden to fetch it, it can never see the noindex
     that would have removed it. The marketing site links to this app from its
     header, its footer and every CTA, so these URLs will be discovered.

  2. IT WOULD STRAND THE REDIRECTS. `/` and `/compare` now 308 to the marketing
     domain (see next.config.mjs). Google has to fetch them to learn that, and a
     Disallow means it never does — so the old URLs stay indexed and the ranking
     never consolidates onto the new domain.

  The combination that actually works is: allow crawling, and send noindex. That
  is app/layout.js's `robots` metadata plus the X-Robots-Tag header in
  next.config.mjs, with this file making sure both are reachable.
*/
export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
  }
}
