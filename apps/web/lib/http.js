/**
 * Shared response helpers for the routes the desktop app calls.
 *
 * Extracted from lib/ai.js so the session routes can use them without importing
 * the AI module. lib/ai.js re-exports both, so nothing that already imported
 * them from there had to change.
 */

/**
 * The desktop renderer calls the AI routes from file:// (origin "null") in a
 * packaged build, so those routes have to be open. The licence key in the body
 * is what actually authorises the call.
 *
 * The session routes do NOT need this — they are called from the Electron main
 * process via Node fetch, which is not subject to CORS at all, exactly like
 * /api/license/validate already is.
 */
export const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function jsonError(reason, status, extra) {
  return Response.json({ error: reason, ...extra }, { status, headers: CORS })
}

/*
  ADMIN SPLIT 2026-09-01 ─ fail() left with the routes it served.

  It lived here for one commit, beside jsonError(), and the pair made a point
  worth keeping even though only one of them is left: jsonError() sends
  `Access-Control-Allow-Origin: *` because the desktop renderer calls the AI and
  licence routes from file://, where the Origin is literally "null". fail() sent
  no CORS headers at all, because the /api/admin routes were only ever called by
  same-origin fetch() from the admin UI, and a wildcard CORS header on a route
  that grants credits is not something anyone should have to explain later.

  Those routes are on another origin now. The function went with them, comment
  and all, to apps/admin/lib/http.js. Nothing in this app called it.

  // export function fail(e, where) {
  //   console.error(`${where}:`, e)
  //   return Response.json({ error: 'Something went wrong' }, { status: 500 })
  // }
*/
