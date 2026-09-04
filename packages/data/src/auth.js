import { cache } from 'react'
import { createClient, createAdminClient } from './supabase-server'

/**
 * The cached read half of the auth gate. Extracted from apps/web/lib/auth.js.
 *
 * ADMIN SPLIT 2026-09-01 ─ WHY THIS FILE IS ONLY HALF OF THAT ONE.
 *
 * The plan for this phase was to move lib/auth.js wholesale. It could not be,
 * and the reason is worth stating because it decides where the seam goes for
 * everything after it.
 *
 * By the time the extraction ran, `requireUser()` had grown two hard references
 * to routes that exist on one origin and not the other: it redirects to
 * `/auth/device-signout` (a route handler apps/web has, added by the
 * account-deletion work, because a Server Component cannot clear a cookie), and
 * it tests every cookie in the jar against `AUTH_COOKIE` from lib/auth-cookie.js.
 * `requireAdminPage()` likewise redirects a non-admin to `/dashboard`, which will
 * not exist on admin.<domain>.
 *
 * Those are POLICY — which routes this deployment has, and what it does to
 * someone it turns away. Data access is not. So the seam is drawn between them:
 *
 *     here            getSupabase, getUser, profileFor, adminProfileFor
 *     each app's      requireUser, getProfile, getAdminProfile,
 *     lib/auth.js     requireAdminPage, requireAdminApi
 *
 * THE COOKIE REGEX IS THE ONE THAT WOULD HAVE BITTEN SILENTLY. `requireUser()`
 * scans the WHOLE jar with a pattern rather than looking up its own storage key.
 * Cookies ignore ports, so in local development apps/web's cookie is visible at
 * localhost:3003 — ship apps/web's `/^sb-.+-auth-token/` into a shared
 * `requireUser` and the admin app, with no session of its own, would still see a
 * cookie, conclude the session had outlived its account, and redirect to
 * `/auth/device-signout` — a 404 on that origin. Production, where the jars are
 * separate, would never reproduce it. Each app keeps its own regex anchored on
 * its own storage key, which is what makes that unreachable rather than merely
 * unlikely.
 *
 * WHAT IS SHARED IS THE PART THAT MATTERS FOR SPEED. `getUser()` is a network
 * call — @supabase/auth-js `GoTrueClient._getUser()` always issues
 * `GET /auth/v1/user` and never decodes the JWT locally — so calling it in the
 * proxy, then the layout, then the page cost three serial round trips per
 * request. `cache()` collapses them into one for the whole render pass, and that
 * is the behaviour both apps need identically.
 *
 * `getSession()` is deliberately absent from this file. It reads the cookie
 * payload without verifying it against the auth server, which is fine for the
 * optimistic redirect in a proxy and is NOT fine for anything that reads data.
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
 * A profile row through the caller's own session, so RLS applies.
 *
 * Takes a userId rather than calling requireUser() itself, which is what the old
 * getProfile() did. That inversion is deliberate: a function in a shared package
 * must not decide to redirect, because the destination is app-specific — see the
 * header. Each app's getProfile() wraps this with its own requireUser() and its
 * own cache().
 */
export const profileFor = cache(async (userId) => {
  const supabase = await getSupabase()
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data ?? null
})

/**
 * The same row through the service-role client, which bypasses RLS.
 *
 * Used for the role check. Reading it with elevated privilege does not weaken
 * the gate — a missing row fails closed either way, because every caller tests
 * `profile?.role !== 'admin'` — it only avoids locking a real admin out if an RLS
 * policy ever hides their own row from them.
 */
export const adminProfileFor = cache(async (userId) => {
  const { data } = await createAdminClient()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data ?? null
})
