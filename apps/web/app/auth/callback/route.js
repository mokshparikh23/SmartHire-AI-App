import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { reactivateDevice, DEVICE_COOKIE } from '@/lib/devices'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  const next  = searchParams.get('next') ?? '/dashboard'

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