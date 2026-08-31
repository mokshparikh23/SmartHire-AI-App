/*
  SPLIT 2026-09-01: this site is the one that SHOULD be indexed.

  Its counterpart is apps/web/app/robots.js, which does the opposite job and is
  easy to get wrong — see the note there. The short version: the app subdomain
  allows crawling and sends noindex, rather than disallowing crawling, because a
  disallowed page can still be indexed from a link and the crawler is then
  forbidden to fetch the noindex that would have removed it.

  Nothing is disallowed here. There is nothing on this deployment that is not
  meant to be read.
*/
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3002').replace(/\/$/, '')

export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  }
}
