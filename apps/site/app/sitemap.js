/*
  SPLIT 2026-09-01: the site had two indexable URLs and now has five.

  That is the whole SEO argument for the multi-page split, and it is worth
  stating plainly: /#how, /#features and /#pricing were never URLs. A fragment
  is not sent to the server and a crawler collapses all of them to "/", so the
  old site was one landing page plus /compare no matter how many sections it
  had. Nothing is lost in retiring those anchors, because nothing was ever
  indexed under them.

  ── lastModified IS HARDCODED ON PURPOSE ──────────────────────────────────────

  `new Date()` here would tell every crawl that all five pages changed today,
  every day. It is false, Google discounts a sitemap that does it, and it
  destroys the one signal this file exists to carry. Update a date when you
  change that page's copy.

  This is the same discipline lib/comparison.js already applies to SOURCE_DATE,
  and for the same reason: a date you did not check is worse than no date.

  /privacy and /terms are deliberately absent until they exist — see the Legal
  column in components/SiteChrome.jsx.
*/
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3002').replace(/\/$/, '')

const ROUTES = [
  { path: '/',             changed: '2026-09-01', priority: 1.0 },
  { path: '/pricing',      changed: '2026-09-01', priority: 0.9 },
  { path: '/how-it-works', changed: '2026-09-01', priority: 0.8 },
  { path: '/features',     changed: '2026-09-01', priority: 0.8 },
  // Its own SOURCE_DATE in lib/comparison.js is what dates the competitor
  // figures; this dates the page.
  { path: '/compare',      changed: '2026-09-01', priority: 0.7 },
]

export default function sitemap() {
  return ROUTES.map(({ path, changed, priority }) => ({
    url: `${SITE}${path}`,
    lastModified: changed,
    priority,
  }))
}
