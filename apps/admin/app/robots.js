/*
  ADMIN SPLIT 2026-09-01 ─ DISALLOW HERE, ALLOW IN apps/web. THE DIFFERENCE IS
  DELIBERATE. Do not "harmonise" these two files.

  apps/web/app/robots.js opens with "THIS FILE ALLOWS CRAWLING ON PURPOSE. DO NOT
  'FIX' IT", and it gives exactly two reasons. Both were checked against this
  origin and neither survives:

  1. "Disallow prevents crawling, not indexing" — a URL linked from elsewhere
     gets indexed as a bare result, and a crawler forbidden to fetch it can never
     see the noindex that would remove it. That reason is load-bearing for
     apps/web because the marketing site links to it from its header, its footer
     and every CTA. NOTHING LINKS HERE. apps/site's /admin redirect is removed
     with the split rather than repointed, apps/web's dashboard sidebar has no
     admin entry and never did, and AdminSidebar's only cross-origin link points
     the other way. The admin surface has always been URL-only.

  2. "It would strand the redirects" — apps/web 308s / and /compare to the
     marketing domain and Google must fetch them to consolidate ranking. This
     origin has no ranking to consolidate and no outbound redirects at all.

  So there is nothing here we want fetched, and Disallow is the honest answer.

  It is not the only layer, because a crawler that ignores this file should still
  be told: app/layout.js carries robots { index: false, follow: false } and
  next.config.mjs sends X-Robots-Tag on every path including /api.

  None of this is a security control. The hostname is in DNS and in Certificate
  Transparency logs the moment a cert is issued; what keeps this origin safe is
  requireAdminPage() and requireAdminApi(), not obscurity.
*/
export default function robots() {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  }
}
