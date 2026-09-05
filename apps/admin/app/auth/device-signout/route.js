import { NextResponse } from 'next/server'
import { createClient } from '@smarthire/data/supabase-server'
import { AUTH_STORAGE_KEY } from '@/lib/auth-cookie'

/**
 * Ends a session whose account no longer exists, or whose refresh token was
 * revoked. Reached from requireUser() in lib/auth.js.
 *
 * ADMIN SPLIT 2026-09-01 ─ a copy of apps/dashboard/app/auth/device-signout/route.js,
 * minus its device-reactivation half (this origin has no devices table) and plus
 * the cookie name. It is copied rather than shared for the same reason
 * lib/auth.js is: both the source route and the destination are this
 * deployment's, and the storage key it clears is the one thing that must NOT be
 * shared.
 *
 * WHY A ROUTE AND NOT A LINE IN requireUser():
 *
 * A Server Component cannot write cookies. supabase-server.js wraps its `setAll`
 * in try/catch — the standard @supabase/ssr pattern — so signOut() from an RSC
 * makes the network call, silently fails to clear the auth cookie, and returns
 * as though it worked. The browser then still holds a valid-looking session.
 *
 * That is not cosmetic. proxy.js decides with getSession(), which reads the
 * cookie WITHOUT a network call while the access token is more than 90s from
 * expiry — so a dead session stays invisible to it for up to an hour, and the
 * result is / -> /login -> / forever, with nothing to sign back into.
 *
 * Route handlers CAN set cookies. Doing the sign-out here clears it for real, so
 * by the time /login renders the proxy sees nothing and lets it through.
 *
 * THE cookieName ARGUMENT IS THE WHOLE ROUTE. Without it this clears the
 * @supabase/ssr default — apps/dashboard's cookie in development, where the jar is
 * shared — and leaves this origin's session exactly where it was, which is the
 * loop above with an extra hop.
 */
export async function GET(request) {
  try {
    const supabase = await createClient({ cookieName: AUTH_STORAGE_KEY })
    await supabase.auth.signOut()
  } catch {
    // Best effort. The redirect below still has to happen — a browser that
    // cannot be signed out cleanly should at least not be left in the loop.
  }

  return NextResponse.redirect(new URL('/login', request.url))
}
