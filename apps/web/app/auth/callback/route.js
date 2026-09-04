import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { reactivateDevice, DEVICE_COOKIE } from '@/lib/devices'
import { safeNext } from 'smarthire-data/next-url'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')

  /*
    SPLIT 2026-09-01: `next` is validated now.

    This route has always read the parameter, and until today nothing in the
    repo ever set one — a grep found a single hit, and it was the comment in
    PricingPlans.jsx saying the parameter was deliberately unused. So the
    unchecked read below was unreachable rather than safe.

    The marketing site changes that: it deep-links to /dashboard/billing?plan=…
    on this origin, that target rides through /login?next= and through the
    signup confirmation email, and it arrives back here. A value that reaches
    this route now started life on a page we do not serve.

    `${origin}${next}` does not pin the host on its own — `next=@evil.com`
    builds https://app.smarthire.ai@evil.com, where our own hostname is merely
    the userinfo. safeNext() is the whitelist; see the note in lib/next-url.js.

    // const next = searchParams.get('next') ?? '/dashboard'
  */
  const next = safeNext(searchParams.get('next')) ?? '/dashboard'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll()             { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          }
        }
      }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      /*
        DEVICES 2026-08-30: the OAuth half of the reactivation in AuthForm.

        This route does not go through that form, so without it a browser signed
        out from another device could complete a Google sign-in and still be
        bounced back to /login by DeviceGate on arrival, permanently. Exchanging
        a valid code is the same proof of ownership a password is.

        Non-fatal on purpose, and deliberately not blocking the redirect: a
        device-bookkeeping failure must not turn a successful sign-in into
        `?error=auth_failed`.
      */
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const deviceId = cookieStore.get(DEVICE_COOKIE)?.value
        if (user && deviceId) {
          await reactivateDevice({ userId: user.id, deviceId })
        }
      } catch { /* non-fatal */ }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}