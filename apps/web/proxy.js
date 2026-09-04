import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { safeNext } from 'smarthire-data/next-url'
import { AUTH_COOKIE } from '@/lib/auth-cookie'

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

/*
  SPLIT 2026-09-01 ─ both redirects below used to throw the destination away.

  `NextResponse.redirect(new URL('/login', request.url))` sent every signed-out
  visitor to a bare form and forgot where they were going. That was survivable
  while the only way to reach /dashboard/billing was from inside the app, with a
  session already in hand. It is not survivable now: the marketing site on the
  other origin deep-links to /dashboard/billing?plan=<packId>, so the FIRST
  thing a buyer without a session hits is this redirect — and losing the query
  means they sign in, land on a bare dashboard, and have to find the pack again.

  This carries no security weight. proxy.js is the optimistic gate; requireUser()
  in lib/auth.js is the authoritative one, and it does the same thing for the
  same reason. What makes it safe is that the value is only ever RE-READ through
  safeNext() — never trusted on the way back out. See lib/next-url.js.
*/
function loginWithNext(request) {
  const to = new URL('/login', request.url)
  const from = `${request.nextUrl.pathname}${request.nextUrl.search}`
  // /login itself is never protected, so `from` can never point back at this
  // redirect — but run it through the same whitelist anyway rather than trusting
  // the shape of a value because of where it came from.
  const next = safeNext(from)
  if (next && next !== '/dashboard') to.searchParams.set('next', next)
  return NextResponse.redirect(to)
}

// DELETE-ACCOUNT 2026-09-01: moved to lib/auth-cookie.js, unchanged. Three files
// now need to agree on what an auth cookie looks like — this one, lib/auth.js
// and app/api/account/delete — and the header there explains why a second copy
// is how the redirect loop comes back.
//
// // @supabase/ssr writes sb-<project-ref>-auth-token, chunked as .0/.1 when the
// // payload is large enough to split across cookies.
// const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/

export async function proxy(request) {
  const path = request.nextUrl.pathname
  const isProtected = PROTECTED.some(p => path.startsWith(p))
  const hasCookie = request.cookies
    .getAll()
    .some(c => AUTH_COOKIE.test(c.name) && c.value)

  // No auth cookie at all: decide with zero work and construct no client.
  if (!hasCookie) {
    // if (isProtected) return NextResponse.redirect(new URL('/login', request.url))
    if (isProtected) return loginWithNext(request)
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

  // if (!session && isProtected) return NextResponse.redirect(new URL('/login', request.url))
  if (!session && isProtected) {
    return loginWithNext(request)
  }

  /*
    SPLIT 2026-09-01: this branch dropped the destination too, and it is the one
    that bites a RETURNING customer.

    A signed-in visitor who clicks Buy on the marketing site is sent to
    /dashboard/billing?plan=…, which is fine. But anyone who arrives at /login
    with a live session — a bookmarked sign-in page, a second tab, the "Log in"
    link in the site header — was bounced to a bare /dashboard, and the
    ?next=/dashboard/billing?plan=… that the redirect above had just carefully
    attached was thrown away one hop later.

    // if (session && AUTH_PAGES.includes(path)) {
    //   return NextResponse.redirect(new URL('/dashboard', request.url))
    // }
  */
  if (session && AUTH_PAGES.includes(path)) {
    const next = safeNext(request.nextUrl.searchParams.get('next')) ?? '/dashboard'
    return NextResponse.redirect(new URL(next, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/login', '/signup']
}
