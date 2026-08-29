import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

/*
  PIVOT 2026-08-29: this file used to call the NETWORK `supabase.auth.getUser()`
  on every matched request — including every RSC payload fetch during client
  navigation — plus a second `profiles.role` query for /admin. That was the
  single largest source of the "clicking a sidebar item is slow" complaint.

  Next 16's own guidance (node_modules/next/dist/docs/01-app/02-guides/
  authentication.md:1035): "since Proxy runs on every route, including prefetched
  routes, it's important to only read the session from the cookie (optimistic
  checks), and avoid database checks."

  So this is now an OPTIMISTIC gate. It decides redirects and nothing else. The
  authoritative check is `requireUser()` / `requireAdminPage()` in lib/auth.js,
  which every protected page calls before it reads any data.

  The previous body, for reference:

  // const { data: { user } } = await supabase.auth.getUser()
  // const path = request.nextUrl.pathname
  //
  // // Redirect unauthenticated users away from protected pages
  // if (!user && (path.startsWith('/dashboard') || path.startsWith('/admin'))) {
  //   return NextResponse.redirect(new URL('/login', request.url))
  // }
  //
  // // Redirect authenticated users away from auth pages
  // if (user && (path === '/login' || path === '/signup')) {
  //   return NextResponse.redirect(new URL('/dashboard', request.url))
  // }
  //
  // // Protect admin routes
  // if (path.startsWith('/admin')) {
  //   const { data: profile } = await supabase
  //     .from('profiles')
  //     .select('role')
  //     .eq('id', user.id)
  //     .single()
  //
  //   if (!profile || profile.role !== 'admin') {
  //     return NextResponse.redirect(new URL('/dashboard', request.url))
  //   }
  // }
  //
  // The /admin role query above is not merely moved — it was also the WEAKER of
  // the two checks, since it used the anon/RLS client while the admin pages
  // query with createAdminClient(), which bypasses RLS. Its replacement,
  // requireAdminPage(), now runs inside all four app/admin page.jsx files as
  // well as the layout, so it also covers a crafted RSC request that skips the
  // layout render entirely. Do not remove those page-level calls.
*/

const PROTECTED = ['/dashboard', '/admin']
const AUTH_PAGES = ['/login', '/signup']

// @supabase/ssr writes sb-<project-ref>-auth-token, chunked as .0/.1 when the
// payload is large enough to split across cookies.
const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/

export async function proxy(request) {
  const path = request.nextUrl.pathname
  const isProtected = PROTECTED.some(p => path.startsWith(p))
  const hasCookie = request.cookies
    .getAll()
    .some(c => AUTH_COOKIE.test(c.name) && c.value)

  // No auth cookie at all: decide with zero work and construct no client.
  if (!hasCookie) {
    if (isProtected) return NextResponse.redirect(new URL('/login', request.url))
    return NextResponse.next({ request })
  }

  // Never touch the session on a prefetch. Concurrent refresh-token rotation can
  // invalidate a live session, and a prefetch is not a navigation — the RSC
  // render that follows is the real gate.
  if (request.headers.get('next-router-prefetch')) {
    return NextResponse.next({ request })
  }

  const supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            supabaseResponse.cookies.set(name, value, options)
          })
        }
      }
    }
  )

  /*
    OPTIMISTIC ONLY.

    getSession() reads the stored cookie and issues NO network call while the
    access token is more than EXPIRY_MARGIN_MS (90s) from expiry. Inside that
    margin it refreshes once and writes the rotated cookies onto
    supabaseResponse — which is the only reason this file still builds a client.
    A stale or malformed cookie makes it call _removeSession(), clearing the
    cookie, so a bad-cookie loop terminates in one hop.

    Deliberately NOT reading session.user: server-side that is an
    insecureUserWarningProxy, and it is not an authorization signal.
  */
  const { data: { session } } = await supabase.auth.getSession()

  if (!session && isProtected) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (session && AUTH_PAGES.includes(path)) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/login', '/signup']
}
