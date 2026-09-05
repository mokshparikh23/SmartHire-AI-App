import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * For server components and API routes (uses session cookies).
 *
 * ADMIN SPLIT 2026-09-01 ─ the optional cookie name.
 *
 * @supabase/ssr maps `cookieOptions.name` onto its `storageKey`
 * (createServerClient.js:27, and the same line exists in
 * createBrowserClient.js:35), which is how two apps on one machine can hold two
 * independent sessions.
 *
 * WHY THAT IS NOT COSMETIC. Cookies ignore ports. In development
 * localhost:3000 and localhost:3003 are the SAME cookie origin, so without a
 * distinct name apps/admin would silently reuse apps/dashboard's session: its own
 * /login would never render, every bug in it would stay invisible, and the first
 * time anyone found out would be in production — where the two are different
 * hosts, the cookies really are host-only, and every admin is suddenly signed
 * out. Naming them apart makes development behave exactly like production, and
 * makes a *.vercel.app preview behave that way too, which host-only scoping
 * cannot do because vercel.app is on the Public Suffix List.
 *
 * Unset means whatever @supabase/ssr defaults to — `sb-<project-ref>-auth-token`
 * — which is what apps/dashboard has always written and must keep writing.
 *
 * // export async function createClient() {
 */
export async function createClient({ cookieName } = {}) {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      ...(cookieName ? { cookieOptions: { name: cookieName } } : null),
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        }
      }
    }
  )
}

// For admin operations (bypasses RLS)
export function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}