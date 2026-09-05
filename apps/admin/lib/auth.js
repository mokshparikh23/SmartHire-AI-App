import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect, forbidden } from 'next/navigation'
import { makeSession, adminProfileFor } from '@smarthire/data/auth'
import { safeNext } from '@smarthire/data/next-url'
import { AUTH_COOKIE, AUTH_STORAGE_KEY } from '@/lib/auth-cookie'

/**
 * This app's auth gate: everything that decides where to SEND someone.
 *
 * ADMIN SPLIT 2026-09-01 ─ the counterpart is apps/dashboard/lib/auth.js, and the two
 * are deliberately separate files rather than one shared module. packages/data
 * owns the READING — the cached Supabase client, getUser(), the profile
 * queries. What lives here is what a shared package must not contain: the routes
 * this deployment has, and the cookie it writes. Read
 * packages/data/src/auth.js's header for the seam.
 *
 * Three things differ from apps/dashboard, and each is a decision:
 *
 *   1. THE COOKIE NAME. `shai-admin-auth`, not @supabase/ssr's default. Cookies
 *      ignore ports, so without it this app would silently reuse apps/dashboard's
 *      session in development and nobody would exercise /login until production.
 *      See lib/auth-cookie.js.
 *
 *   2. THE DENY TARGET. apps/dashboard sends a non-admin to /dashboard. There is no
 *      /dashboard on this origin, so this app answers 403 instead — see
 *      requireAdminPage().
 *
 *   3. NO getProfile(). apps/dashboard's sidebar and settings page read the caller's
 *      own profile through their own session; nothing on this origin does. Every
 *      page here reads OTHER people's rows through the service-role client, and
 *      the only thing it needs about the caller is whether they are an admin.
 *      Adding one later means one line — makeSession() already returns
 *      profileFor.
 */

/*
  Called once, at module scope. cache() memoises on the wrapper's identity, so
  calling makeSession() per request would hand out a fresh wrapper each time and
  dedupe nothing — which is the entire cost packages/data/src/auth.js exists to
  remove. One call per app; these are module constants from here on.
*/
const { getSupabase, getUser } = makeSession({ cookieName: AUTH_STORAGE_KEY })

export { getSupabase, getUser }

/**
 * Every page on this origin starts with requireAdminPage(), which starts here.
 *
 * @param {{ next?: string }} [options]
 */
export async function requireUser({ next } = {}) {
  const user = await getUser()
  if (!user) {
    /*
      A cookie that outlived its account — the same trap apps/dashboard documents at
      length, reproduced here because this origin can reach it too.

      proxy.js decides with getSession(), which reads the cookie WITHOUT a
      network call while the access token is more than 90s from expiry. So a
      session that died server-side (the account deleted from the app origin, the
      refresh token revoked) stays invisible to the proxy for up to an hour.
      Sending such a request to /login would bounce off the proxy straight back
      here: a loop, with no account left to sign into.

      /auth/device-signout is a ROUTE HANDLER, which can actually clear the
      cookie. A Server Component cannot — supabase-server.js wraps its cookie
      `setAll` in try/catch, the standard @supabase/ssr pattern, so signOut()
      from here would make the network call, silently fail to clear anything, and
      return as though it worked.

      AUTH_COOKIE is THIS app's pattern. Using apps/dashboard's would fire on apps/dashboard's
      cookie in development, where the jar is shared, and redirect to a route
      this origin does have — but for a session that was never ours. See
      lib/auth-cookie.js.
    */
    const jar = await cookies()
    const hasAuthCookie = jar.getAll().some(c => AUTH_COOKIE.test(c.name) && c.value)
    if (hasAuthCookie) redirect('/auth/device-signout')

    // safeNext even though nothing off-origin links here: the value is only ever
    // one this app's own proxy stamped, and re-reading it through the whitelist
    // rather than trusting its provenance is the rule that keeps it true.
    const to = safeNext(next)
    redirect(to ? `/login?next=${encodeURIComponent(to)}` : '/login')
  }
  return user
}

/**
 * The caller's profile, read through the service-role client so RLS cannot hide
 * it. A missing row fails closed either way — every caller tests
 * `profile?.role !== 'admin'` — so elevated privilege here only avoids locking a
 * real admin out if a policy ever hides their own row from them.
 */
export const getAdminProfile = cache(async () => {
  const user = await requireUser()
  return adminProfileFor(user.id)
})

/**
 * Admin gate for PAGES. Throws; it does not return a status.
 *
 * ADMIN SPLIT 2026-09-01 ─ WHY 403 AND NOT A REDIRECT TO THE APP.
 *
 * apps/dashboard's version does `redirect('/dashboard')`. That route does not exist
 * here, and a CROSS-origin bounce is worse than it looks:
 *
 *   - It needs NEXT_PUBLIC_APP_URL on this deployment, which is optional by
 *     design (see .env.local.example). Unset, there is no correct destination —
 *     and the repo's standing rule is never to redirect to a guessed one. So a
 *     403 page has to exist anyway, at which point the redirect is a second code
 *     path guarding the first.
 *   - A silent bounce to the dashboard is indistinguishable, from the user's
 *     chair, from "the admin site is broken". That is the exact failure this
 *     repo already learned from once — "I clicked log in and nothing happened".
 *     A real admin whose role row got clobbered would be bounced with no
 *     explanation and nothing to tell an ops person.
 *
 * Hiding the origin is NOT among the reasons. /login is public, and the hostname
 * is in DNS and in Certificate Transparency logs the moment a cert is issued.
 *
 * forbidden() needs `experimental.authInterrupts` in next.config.mjs and an
 * app/forbidden.jsx to render. Without the flag it throws a plain E488 error at
 * RUNTIME, on the deny path only — which is by definition the path nobody
 * exercises. That is why it is in the Phase 3 drill: sign in as a non-admin and
 * expect a 403 page, not error.jsx.
 *
 * It is a throw rather than a returned {ok} shape on purpose: a missing `return`
 * on a falsy check is how a page ends up unguarded, and a throw cannot be
 * forgotten.
 *
 * Every page calls this, not only the layout. Whether a layout re-renders is
 * decided by the client-supplied `next-router-state-tree` header, so a layout is
 * not a trustworthy boundary against a crafted RSC request — and the pages here
 * query with createAdminClient(), which bypasses RLS entirely.
 */
export async function requireAdminPage() {
  const profile = await getAdminProfile()
  if (profile?.role !== 'admin') forbidden()
  return profile
}

/**
 * The same gate for API ROUTES, which must answer with JSON rather than throw an
 * HTML page — a 403 document reaches fetch() as an opaque body and surfaces in
 * the UI as "Unexpected token '<'".
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
