import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { isDeviceRevoked, DEVICE_COOKIE } from '@/lib/devices'

/**
 * Enforces "sign out this browser" on the browser being signed out.
 *
 * Revoking a web device flags a row, but a browser's Supabase session knows
 * nothing about that table and there is no API to revoke one other session by
 * id. So enforcement happens where the revoked browser next shows up: here, on
 * its next dashboard navigation.
 *
 * Renders nothing. Mounted in the dashboard layout inside its own Suspense
 * boundary so the shell still paints immediately.
 *
 * WHY NOT IN proxy.js: that file was deliberately reduced to cookie-only
 * optimistic checks in 4b2c816 because per-request database work there was the
 * main cause of slow navigation, and it runs on prefetches too. This runs once
 * per real dashboard render, which is the right frequency for a check whose
 * answer only changes when someone clicks a button on another machine.
 */
export default async function DeviceGate() {
  const [user, jar] = await Promise.all([getUser(), cookies()])

  // No user means some other guard is already redirecting; no cookie means this
  // browser has never registered, which is not the same as being revoked.
  if (!user) return null

  const deviceId = jar.get(DEVICE_COOKIE)?.value
  if (!deviceId) return null

  if (!(await isDeviceRevoked({ userId: user.id, deviceId }))) return null

  /*
    FIX 2026-08-30: this used to call supabase.auth.signOut() here and then
    redirect straight to /login. Both halves were wrong, and together they made
    the feature look like it did nothing:

      1. A Server Component cannot write cookies. supabase-server.js wraps its
         setAll in try/catch, so signOut() made its network call, silently failed
         to clear the auth cookie, and returned as though it had worked.

      2. With the cookie still present, proxy.js redirected /login back to
         /dashboard — and its getSession() reads the cookie without a network
         call while the token is >90s from expiry, so the revoked refresh token
         stayed invisible. /dashboard → /login → /dashboard, indefinitely.

    Redirecting through a route handler fixes both: route handlers can set
    cookies, so the session is genuinely gone before /login is reached.

    // try { const supabase = await getSupabase(); await supabase.auth.signOut() } catch {}
    // redirect('/login?signed_out=device')
  */
  redirect('/auth/device-signout')
}
