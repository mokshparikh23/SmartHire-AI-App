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

/**
 * ADMIN SPLIT 2026-09-01 ─ the catch-all for the /api/admin routes.
 *
 * NOTE THE MISSING CORS HEADERS, WHICH IS THE POINT OF IT BEING A SEPARATE
 * HELPER RATHER THAN jsonError() ABOVE. That one answers the desktop app, which
 * calls from file:// (origin "null") and therefore needs `Allow-Origin: *`. The
 * admin routes are called only by same-origin fetch() from the admin UI, and
 * `Access-Control-Allow-Origin: *` on a route that grants credits is a header
 * nobody should be able to point at later and ask why it is there.
 *
 * What it replaced. All five admin routes ended:
 *
 *   // } catch (e) {
 *   //   return NextResponse.json({ error: e.message }, { status: 500 })
 *   // }
 *
 * `e.message` on that path is raw Postgres. A bad role produced
 * `new row for relation "profiles" violates check constraint
 * "profiles_role_check"`, and a malformed id produced
 * `invalid input syntax for type uuid: "..."` — table names, column names and
 * constraint names handed to the browser, in a 500 that also made a plain
 * client error un-actionable by the caller and noisy in any 5xx alerting.
 *
 * The detail goes to the server log, where it is useful; the caller gets a
 * constant. Callers that can say something specific should return their own 4xx
 * BEFORE reaching this — see app/api/admin/users/role/route.js.
 */
export function fail(e, where) {
  console.error(`${where}:`, e)
  return Response.json({ error: 'Something went wrong' }, { status: 500 })
}
