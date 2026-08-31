/*
  COPY RULES: see the banner at the top of app/layout.js — no impersonation,
  no concealment, no latency figure.

  SPLIT 2026-09-01: carved out of apps/web/app/page.jsx, and RENAMED on the way.

  It was `PLATFORMS` there. apps/web/lib/releases.js also exports a `PLATFORMS`,
  meaning ['mac', 'win'] — the desktop build targets. The two never met while
  one lived in a page file and the other in a lib, but a download button on this
  site (lib/app-links.js downloadUrl) puts them one import away from each other,
  and two arrays called PLATFORMS meaning different things is how the wrong one
  gets used. Renamed at the point of extraction rather than after the collision.
*/

/*
  LOGOS 2026-08-30: the band was six meeting tools. Superset and LeetCode are
  neither — one is a campus-hiring portal, the other a coding-assessment site —
  so adding them widens what this section claims. The lede was rewritten to
  match; the title did not need to change, because "whatever the interview is
  running on" already covered both. Eight entries also retire the six-column
  grid, which would have left two orphans on a wide screen.
*/
export const MEETING_PLATFORMS = [
  { key: 'zoom',     name: 'Zoom' },
  { key: 'teams',    name: 'Microsoft Teams' },
  { key: 'meet',     name: 'Google Meet' },
  { key: 'webex',    name: 'Webex' },
  { key: 'lark',     name: 'Lark' },
  { key: 'chime',    name: 'Amazon Chime' },
  { key: 'superset', name: 'Superset' },
  { key: 'leetcode', name: 'LeetCode' },
]
