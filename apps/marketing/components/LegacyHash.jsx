'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/*
  SPLIT 2026-09-01 ─ the seven anchors the landing page used to be.

  /#how, /#grounded, /#features, /#desi, /#platforms, /#limits and /#pricing
  were sections of one long page. They are routes now, and anyone holding a
  bookmark, a Slack link or a browser-history entry to one of them lands on the
  home page at a fragment that no longer exists.

  A SERVER REDIRECT CANNOT FIX THIS. A fragment is never sent to the server —
  next.config's redirects() and proxy.js both see "/" and nothing else. The only
  place the hash is legible is the browser, so this is the only place the
  mapping can live.

  THERE IS NO SEO COST EITHER WAY. A crawler already treated all seven of those
  URLs as "/", so nothing was ever indexed under them and nothing needs
  consolidating. This is purely for the humans who bookmarked a section.

  router.replace, not push: the visitor did not choose to visit the home page,
  so it should not become a back-button stop between them and where they meant
  to go.

  Mounted on / only. And the home page's teaser bands deliberately carry NO ids
  — an id on a teaser would compete with this map and land someone who
  bookmarked the pricing table on a four-line summary of it instead.
*/
const MOVED = {
  '#how':       '/how-it-works',
  '#grounded':  '/how-it-works#grounded',
  '#features':  '/features',
  '#desi':      '/features#desi',
  '#platforms': '/features#platforms',
  '#limits':    '/features#limits',
  '#pricing':   '/pricing',
  // '#consent' was renamed to '#grounded' on 2026-08-30, before the split. A
  // link that old is unlikely, and it costs one line to honour.
  '#consent':   '/how-it-works#grounded',
}

export default function LegacyHash() {
  const router = useRouter()

  useEffect(() => {
    const target = MOVED[window.location.hash]
    if (target) router.replace(target)
  }, [router])

  return null
}
