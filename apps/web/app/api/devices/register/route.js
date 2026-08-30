import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getUser } from '@/lib/auth'
import {
  touchDevice, isDeviceRevoked, reactivateDevice, webLabel,
  DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE,
} from '@/lib/devices'

/** Shapes isDeviceRevoked like touchDevice's return, so the caller can branch once. */
const isRevoked = async (args) => ({ revoked: await isDeviceRevoked(args) })

/**
 * Registers the browser as a device, and reports whether it has been signed out
 * from somewhere else.
 *
 * WHY A ROUTE AND NOT MIDDLEWARE OR A LAYOUT: proxy.js was deliberately reduced
 * to cookie-only optimistic checks in 4b2c816 because per-request database work
 * there was the main cause of slow navigation, and doing it in the dashboard
 * layout would mean a write on every page view. This fires once per browser
 * session from <DeviceRegistrar>, which is as often as the answer can change.
 *
 * WHY NOT ON LOGIN: registering in the sign-in handler would miss every session
 * that already exists, and there are two sign-in paths (password and the OAuth
 * callback) that would each need it. Registering from the dashboard catches all
 * of them, including sessions predating this feature.
 */
export async function POST(request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const jar = await cookies()
  const existing = jar.get(DEVICE_COOKIE)?.value

  /*
    randomUUID, not a counter or a hash of the user agent: this id is the
    browser's identity for revocation, so two people on the same UA must not
    collide into one row that signs them both out together.
  */
  const deviceId = existing || crypto.randomUUID()

  /*
    ?check=1 means "this browser already registered in this tab session — just
    tell me whether I have been signed out". It exists so <DeviceRegistrar> can
    ask that question on every load (a refresh must notice a revocation) without
    an upsert every time. A browser with no cookie yet always registers properly,
    whatever the flag says.
  */
  const params = new URL(request.url).searchParams
  const checkOnly = params.get('check') === '1' && !!existing

  /*
    ?fresh=1 is sent once, immediately after a successful sign-in. It clears any
    revocation on this device, because signing in again is the account owner
    saying "this browser is mine". Without it, signing a browser out locked that
    browser out permanently — the cookie survives sign-out, so the next login was
    bounced back to /login by DeviceGate on every attempt.

    Only this flag may clear a revocation. The ambient calls above must not, or a
    revoked browser would un-revoke itself on its next dashboard load.
  */
  if (params.get('fresh') === '1' && existing) {
    await reactivateDevice({ userId: user.id, deviceId })
  }

  const { revoked } = checkOnly
    ? await isRevoked({ userId: user.id, deviceId })
    : await touchDevice({
        userId:   user.id,
        deviceId,
        kind:     'web',
        // Parsed server-side from the request. The client never supplies the label.
        label:    webLabel(request.headers.get('user-agent') || ''),
      })

  const res = NextResponse.json({ deviceId, revoked })

  // Re-set on every call so the window slides forward rather than expiring 13
  // months after the browser was first seen.
  res.cookies.set(DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge:   DEVICE_COOKIE_MAX_AGE,
  })

  return res
}
