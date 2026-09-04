import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSupabase, getUser, profileFor, adminProfileFor } from 'smarthire-data/auth'
import { safeNext } from 'smarthire-data/next-url'
import { AUTH_COOKIE } from '@/lib/auth-cookie'

/**
 * This app's auth gate: everything that decides where to SEND someone.
 *
 * ADMIN SPLIT 2026-09-01 ─ the read half of this file moved to
 * packages/data/src/auth.js and is re-exported below. What stayed is what a
 * shared package must not contain: literal route paths, and the cookie pattern
 * this deployment writes. Read that file's header for the seam and for the
 * dev-only bug that sharing the regex would have produced.
 *
 * The imports that used to head this file, for the record:
 *
 *   // import { createClient, createAdminClient } from 'smarthire-data/supabase-server'
 *   // import { safeNext } from 'smarthire-data/next-url'
 *
 * getSupabase and getUser are re-exported rather than re-wrapped. They are
 * already cache()'d in the package, and wrapping a cached function in another
 * cache() would give two memo entries for one round trip — which is the exact
 * cost this file was written to remove.
 *
 * Why the gate is called from PAGES and not only from layouts: layouts are not
 * re-executed on sibling client navigation (Next only renders below the segment
 * that changed), and whether one re-renders is decided by the client-supplied
 * `next-router-state-tree` header. A layout-only gate would render a sibling
 * page with no auth check in that pass at all.
 */
export { getSupabase, getUser }

/**
 * Every protected page starts with this. It replaces the old pattern of
 * dereferencing `user.id` straight after `getUser()`, which threw a TypeError
 * on a lapsed session and — with no error boundary — hit Next's default error
 * screen. `redirect()` throws through RedirectBoundary, not the error boundary,
 * so this produces a clean navigation instead.
 *
 * SPLIT 2026-09-01 ─ the optional `next`.
 *
 * proxy.js carries the destination through /login (see loginWithNext there),
 * which covers the realistic signed-out paths: no cookie at all, and a cookie
 * whose session has lapsed. This function fires in the narrower case where the
 * optimistic cookie check PASSED and the authoritative network call disagreed,
 * or on a crafted RSC request that skipped the proxy — and there it still lost
 * the destination.
 *
 * It is passed in rather than discovered because Next does not expose the
 * request path to a Server Component. The way to get it is to have proxy.js
 * stamp a header onto the forwarded request — but that means rebuilding the
 * `supabaseResponse` that the Supabase cookie setter writes rotated tokens
 * onto, and proxy.js's own comment is explicit that this response object is the
 * only reason it still constructs a client at all. Breaking token rotation to
 * improve an edge-case redirect is the wrong trade, so the one page that
 * actually receives a cross-origin deep link passes its own target instead.
 *
 * @param {{ next?: string }} [options]
 */
export async function requireUser({ next } = {}) {
  const user = await getUser()
  if (!user) {
    /*
      DELETE-ACCOUNT 2026-09-01 ─ a cookie that outlived its account.

      This branch means the optimistic cookie check passed and the authoritative
      network call disagreed. Until now every such request was sent to /login,
      which works when the cookie is merely stale-looking — but not when the
      cookie is still a VALID, unexpired JWT for a user that no longer exists.

      That state is now reachable, and by design: app/api/account/delete clears
      the cookies on ITS OWN response, which reaches exactly one browser. Every
      other browser this account was signed in on — which is the whole thing the
      Devices card exists to model — keeps a token that proxy.js accepts, because
      proxy.js decides with getSession(), a cookie read with no network call
      while the token is more than 90s from expiry. So: /dashboard passes the
      proxy, this function redirects to /login, the proxy sees the session and
      sends it back to /dashboard. A loop, for up to an hour, and unlike every
      other cause there is no account left to sign back into.

      /auth/device-signout is the route that already exists to break exactly this
      cycle — a route handler, so it can actually clear the cookie, which a
      Server Component cannot. Sending the request there instead of to /login
      also closes the same latent loop for every OTHER way a session can die
      server-side, not just deletion.

      Only when a cookie is actually present. Without one there is nothing to
      clear and /login is both correct and one hop shorter.

      ADMIN SPLIT 2026-09-01: this block is why requireUser() did not move into
      packages/data. Both the route and the regex are this deployment's, and
      AUTH_COOKIE matches on NAME across the whole jar rather than looking up a
      storage key — so shipping it to another app that shares a cookie jar in dev
      (ports do not separate cookies) would make that app redirect to a route it
      does not have. apps/admin gets its own copy of both.
    */
    const jar = await cookies()
    const hasAuthCookie = jar.getAll().some(c => AUTH_COOKIE.test(c.name) && c.value)
    if (hasAuthCookie) redirect('/auth/device-signout')

    // Re-validated here rather than trusted from the caller: on the billing
    // page this string is built from a search param that started on another
    // origin. See next-url.js in packages/data.
    const to = safeNext(next)
    // redirect('/login')
    redirect(to ? `/login?next=${encodeURIComponent(to)}` : '/login')
  }
  return user
}

/**
 * The signed-in user's profile row. Shared by the sidebar and the pages.
 *
 * ADMIN SPLIT 2026-09-01: the query moved to profileFor() in packages/data; the
 * requireUser() call did not, because redirecting is the half that is this app's
 * to decide. cache() here memoises the pair, so the argument-less call signature
 * every caller already uses is unchanged.
 *
 *   // export const getProfile = cache(async () => {
 *   //   const user = await requireUser()
 *   //   const supabase = await getSupabase()
 *   //   const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
 *   //   return data ?? null
 *   // })
 */
export const getProfile = cache(async () => {
  const user = await requireUser()
  return profileFor(user.id)
})

/**
 * Admin gate for PAGES. Redirects; it does not return a status.
 *
 * ADMIN SPLIT 2026-09-01 ─ the stale comment that used to sit here claimed
 * `lib/admin.js` exports a `requireAdmin()` for the /api/admin routes. There is
 * no lib/admin.js and there never was in this tree; both gates are in this file
 * and always have been. The point it was making survives the correction and is
 * worth keeping: two gates with one name, where one is falsy-checked and the
 * other throws, is how a route ends up unguarded — so they get different names.
 *
 * The role is read through the service-role client. A hidden row fails closed
 * either way (`profile?.role !== 'admin'`); reading it with elevated privilege
 * only avoids locking a real admin out if an RLS policy ever hides their own row.
 *
 * `/dashboard` is the deny target because this app has one. apps/admin will not,
 * which is the second reason this function stays app-local — see
 * packages/data/src/auth.js.
 */
export const getAdminProfile = cache(async () => {
  const user = await requireUser()
  return adminProfileFor(user.id)
})

export async function requireAdminPage() {
  const profile = await getAdminProfile()
  if (profile?.role !== 'admin') redirect('/dashboard')
  return profile
}

/**
 * The same gate for API ROUTES, which must answer with JSON rather than a
 * redirect — a 302 to /dashboard reaches fetch() as an opaque HTML body and
 * surfaces in the admin UI as "Unexpected token '<'".
 *
 * @returns {{ok: true, user: object} | {ok: false, status: number, error: string}}
 */
export async function requireAdminApi() {
  const user = await getUser()
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }

  const profile = await getAdminProfile()
  if (profile?.role !== 'admin') return { ok: false, status: 403, error: 'Forbidden' }

  return { ok: true, user }
}
