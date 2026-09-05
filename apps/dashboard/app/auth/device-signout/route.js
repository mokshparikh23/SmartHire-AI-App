import { NextResponse } from 'next/server'
import { createClient } from '@smarthire/data/supabase-server'

/**
 * Ends the session for a browser that was signed out from another device.
 *
 * WHY THIS EXISTS AS A ROUTE AND NOT A LINE IN DeviceGate:
 *
 * A Server Component cannot write cookies. lib/supabase-server.js wraps its
 * `setAll` in try/catch — the standard @supabase/ssr pattern — so calling
 * signOut() from an RSC makes the network call, silently fails to clear the
 * auth cookie, and returns as though it worked. The browser then still holds a
 * valid-looking session.
 *
 * That is not a cosmetic failure. proxy.js redirects any request to /login that
 * still carries a session back to /dashboard, and its getSession() reads the
 * cookie WITHOUT a network call while the access token is more than 90s from
 * expiry — so a revoked refresh token stays invisible for up to an hour. The
 * result was /dashboard → /login → /dashboard, forever.
 *
 * Route handlers CAN set cookies. Doing the sign-out here clears the cookie for
 * real, so by the time /login is reached proxy.js sees no session and lets it
 * render.
 */
export async function GET(request) {
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()
  } catch {
    // Best effort. The redirect below still has to happen — a browser that
    // cannot be signed out cleanly should at least not be left on the dashboard.
  }

  const url = new URL('/login', request.url)
  url.searchParams.set('signed_out', 'device')
  return NextResponse.redirect(url)
}
