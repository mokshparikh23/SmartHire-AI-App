import { NextResponse } from 'next/server'

/**
 * The catch-all for this app's /api/admin routes.
 *
 * ADMIN SPLIT 2026-09-01 ─ moved here from apps/dashboard/lib/http.js with the routes
 * it serves. It sat next to jsonError() there, and the reason it was never the
 * same function is the reason this file does not carry that one:
 *
 *   NO CORS HEADERS. jsonError() sends `Access-Control-Allow-Origin: *` because
 *   the desktop renderer calls the AI and licence routes from file://, where the
 *   Origin is literally "null" — those routes have to be open, and the licence
 *   key in the body is what authorises them. Not one route on THIS origin is
 *   called from anywhere but same-origin fetch() in the admin UI, and a wildcard
 *   CORS header on a route that grants credits is not something anyone should
 *   have to explain later.
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
 * `invalid input syntax for type uuid: "..."` — table, column and constraint
 * names handed to the browser, inside a 500 that also made a plain client error
 * un-actionable by the caller and noisy in any 5xx alerting.
 *
 * The detail goes to the server log, where it is useful; the caller gets a
 * constant. A route that can say something specific should return its own 4xx
 * BEFORE reaching this — see app/api/admin/users/role/route.js.
 */
export function fail(e, where) {
  console.error(`${where}:`, e)
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
}
