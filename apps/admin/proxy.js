import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { safeNext } from '@smarthire/data/next-url'
import { AUTH_COOKIE, AUTH_STORAGE_KEY } from '@/lib/auth-cookie'

/*
  ADMIN SPLIT 2026-09-01 ─ adapted from apps/dashboard/proxy.js, with the polarity
  inverted. Read that file first; its long header explains why this is an
  OPTIMISTIC gate that decides redirects and nothing else, and why the
  authoritative check is requireAdminPage() inside every page.

  Next 16's own guidance (node_modules/next/dist/docs/01-app/02-guides/
  authentication.md): "since Proxy runs on every route, including prefetched
  routes, it's important to only read the session from the cookie (optimistic
  checks), and avoid database checks."

  WHY KEEP A PROXY AT ALL, on an origin where every page already gates itself:

    1. The zero-work signed-out path. No cookie means a redirect with no Supabase
       client constructed and no RSC render started. On an origin where every
       page reaches for createAdminClient() — the service-role client, which
       bypasses RLS — keeping unauthenticated traffic from ever entering a render
       is worth the file on its own.

    2. Token rotation. apps/dashboard/proxy.js's own comment says the `supabaseResponse`
       write "is the only reason this file still builds a client". Admin sessions
       are long and idle, so the refresh that lands here matters MORE than it does
       next door, not less.
*/

/*
  AN ALLOWLIST, NOT apps/dashboard's PROTECTED PREFIX LIST, AND THAT IS THE WHOLE
  DIFFERENCE.

  Over there, `PROTECTED = ['/dashboard', '/admin']` means a route added tomorrow
  is PUBLIC by default — correct for an app with a marketing-adjacent surface.
  Here every route is admin-only, so that default is backwards. With an
  allowlist, the failure mode of forgetting to list a path is "too locked down",
  which is visible and harmless; the failure mode of forgetting to protect one
  would not be.

  Adding a public path is a deliberate one-line edit to this array.
*/
const PUBLIC = ['/login']

/*
  Deliberately NOT porting apps/dashboard's `session && AUTH_PAGES.includes(path)`
  bounce, which sends an already-signed-in visitor away from /login.

  This proxy knows only that a SESSION exists, never that it is an ADMIN session
  — that needs a database read, which is exactly what an optimistic gate must not
  do. So bouncing would push a signed-in non-admin off the form and into the 403
  with no way back to sign in as somebody else. app/login/page.jsx handles the
  signed-in case properly, because it can afford to look at the role.

  // const AUTH_PAGES = ['/login', '/signup']
*/

export async function proxy(request) {
  const path = request.nextUrl.pathname
  const isProtected = !PUBLIC.includes(path)
  const isApi = path.startsWith('/api')
  const hasCookie = request.cookies
    .getAll()
    .some(c => AUTH_COOKIE.test(c.name) && c.value)

  /*
    /api ANSWERS WITH JSON, NEVER A REDIRECT.

    Every /api caller here is a fetch() from the admin UI. A 307 on a POST is
    followed with the method preserved, so an expired session would POST to
    /login — a page route — and the HTML that comes back reaches the caller as
    "Unexpected token '<'". That is the exact string requireAdminApi()'s comment
    in lib/auth.js names as the symptom it was written to prevent, and admin
    sessions sit idle long enough for this to be the normal case rather than an
    edge one.

    401 rather than 403: this branch only knows there is no usable cookie, which
    is "not authenticated", not "not permitted". requireAdminApi() draws the
    second distinction, and it is the real gate either way.
  */
  const deny = () =>
    isApi
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : loginWithNext(request)

  // No auth cookie at all: decide with zero work and construct no client.
  if (!hasCookie) {
    if (isProtected) return deny()
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
      // The same storage key lib/supabase.js writes in the browser. Omitting it
      // here would make this client look for the @supabase/ssr default, find
      // nothing, and log every admin out on their first navigation.
      cookieOptions: { name: AUTH_STORAGE_KEY },
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
    OPTIMISTIC ONLY. getSession() reads the stored cookie and issues NO network
    call while the access token is more than EXPIRY_MARGIN_MS (90s) from expiry.
    Inside that margin it refreshes once and writes the rotated cookies onto
    supabaseResponse — which is the only reason this file builds a client at all.
    A stale or malformed cookie makes it call _removeSession(), clearing the
    cookie, so a bad-cookie loop terminates in one hop.

    Deliberately NOT reading session.user: server-side that is an
    insecureUserWarningProxy, and it is not an authorization signal.
  */
  const { data: { session } } = await supabase.auth.getSession()

  if (!session && isProtected) return deny()

  return supabaseResponse
}

function loginWithNext(request) {
  const to = new URL('/login', request.url)
  const from = `${request.nextUrl.pathname}${request.nextUrl.search}`
  // /login is in PUBLIC, so `from` can never point back at this redirect — but
  // run it through the same whitelist anyway rather than trusting the shape of a
  // value because of where it came from.
  const next = safeNext(from)
  if (next && next !== '/') to.searchParams.set('next', next)
  return NextResponse.redirect(to)
}

export const config = {
  /*
    Everything except the static asset paths.

    _next is excluded WHOLESALE rather than as _next/static and _next/image.
    Turbopack's dev HMR and RSC-adjacent endpoints live elsewhere under /_next,
    and a signed-out visitor would otherwise have those 307'd to /login. On this
    origin that lands in the worst place: /login is the one page whose JavaScript
    must arrive, because without hydration the sign-in form falls back to a
    native GET and puts an admin password in the URL bar. See the
    allowedDevOrigins note in next.config.mjs.

    The real gate is requireAdminPage() / requireAdminApi(), so nothing is lost
    by being generous here.
  */
  matcher: ['/((?!_next|favicon.ico|robots.txt).*)'],
}
