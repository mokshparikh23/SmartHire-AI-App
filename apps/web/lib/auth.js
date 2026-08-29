import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase-server'

/**
 * The one authoritative auth gate for every server render.
 *
 * Why this file exists: `getUser()` is a network call. @supabase/auth-js
 * `GoTrueClient._getUser()` always issues `GET /auth/v1/user` — it never decodes
 * the JWT locally — so calling it in the proxy, then the layout, then the page
 * cost three serial round trips per request. React `cache()` collapses them into
 * one for the whole render pass.
 *
 * Why the check lives here and is called from PAGES, not just the layout:
 * layouts are not re-executed on sibling client navigation (Next only renders
 * below the segment that changed). A layout-only gate would render
 * `usage/page.jsx` with no auth check in that pass at all.
 *
 * `getSession()` is deliberately absent. It reads the cookie payload without
 * verifying it against the auth server, which is fine for the optimistic
 * redirect in proxy.js and is NOT fine for anything that reads data.
 */

/** One Supabase cookie client per request. cache() keys on the empty arg list. */
export const getSupabase = cache(createClient)

/** The authoritative call. Returns null rather than throwing, so callers choose. */
export const getUser = cache(async () => {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
})

/**
 * Every protected page starts with this. It replaces the old pattern of
 * dereferencing `user.id` straight after `getUser()`, which threw a TypeError
 * on a lapsed session and — with no error boundary — hit Next's default error
 * screen. `redirect()` throws through RedirectBoundary, not the error boundary,
 * so this produces a clean navigation instead.
 */
export async function requireUser() {
  const user = await getUser()
  if (!user) redirect('/login')
  return user
}

/** The signed-in user's profile row. Shared by the sidebar and the pages. */
export const getProfile = cache(async () => {
  const user = await requireUser()
  const supabase = await getSupabase()
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  return data ?? null
})

/**
 * Admin gate for PAGES. Redirects; it does not return a status.
 *
 * Named `requireAdminPage` on purpose: `lib/admin.js` already exports a
 * `requireAdmin()` for the /api/admin/* routes which returns
 * `{ok, status, error}` instead of redirecting. Two gates with one name, where
 * one is falsy-checked and the other throws, is how a route ends up unguarded —
 * so they get different names.
 *
 * Every admin page must call this, not only `app/admin/layout.jsx`. Whether a
 * layout re-renders is decided by the client-supplied `next-router-state-tree`
 * header, so a layout is not a trustworthy boundary against a crafted RSC
 * request — and the admin pages query with `createAdminClient()`, which bypasses
 * RLS entirely.
 *
 * The role is read through the service-role client to match the behaviour
 * `app/admin/layout.jsx` already had. A hidden row fails closed either way
 * (`profile?.role !== 'admin'`); reading it with elevated privilege only avoids
 * locking a real admin out if an RLS policy ever hides their own row.
 */
export const getAdminProfile = cache(async () => {
  const user = await requireUser()
  const { data } = await createAdminClient()
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  return data ?? null
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
