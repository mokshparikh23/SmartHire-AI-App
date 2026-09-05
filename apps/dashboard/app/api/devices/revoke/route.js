import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getUser, getSupabase } from '@/lib/auth'
import { revokeDevice, revokeAllDevices, DEVICE_COOKIE } from '@/lib/devices'

/**
 * Sign out one device, or every device on the account.
 *
 * Body: { deviceId } for one, or { all: true } for everything.
 *
 * WHAT "EVERYWHERE" HAS TO DO, and why this is a route rather than a column
 * grant on the table: signing out everywhere is two operations that must happen
 * together.
 *
 *   1. Flag every device row revoked. This is what stops the desktop apps —
 *      each one notices on its next licence check, within about ten seconds.
 *
 *   2. Revoke the Supabase refresh tokens. Desktop apps authenticate with a
 *      licence key, but browsers hold a Supabase session that knows nothing
 *      about our devices table; flagging a row would leave that session working.
 *
 * Doing only (1) is the bug this design exists to avoid: a device list that says
 * "signed out everywhere" while the other browser is still reading the page.
 */
export async function POST(request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  const jar = await cookies()
  const thisDevice = jar.get(DEVICE_COOKIE)?.value ?? null

  try {
    if (body?.all) {
      /*
        The browser clicking the button keeps its own row. Every other product
        works this way, and the alternative — bouncing the user to /login the
        instant they secure their account — reads as a failure rather than as
        the feature working.
      */
      await revokeAllDevices({ userId: user.id, exceptDeviceId: thisDevice })

      /*
        scope: 'others' revokes every refresh token EXCEPT the caller's, which is
        exactly the same intent as exceptDeviceId above. A global signOut would
        also kill this tab's session and contradict the row we just spared.
      */
      const supabase = await getSupabase()
      const { error } = await supabase.auth.signOut({ scope: 'others' })
      if (error) throw error

      return NextResponse.json({ ok: true, scope: 'all' })
    }

    const deviceId = body?.deviceId
    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId or all is required' }, { status: 400 })
    }

    await revokeDevice({ userId: user.id, deviceId })

    /*
      Signing out THIS browser specifically. There is no Supabase API to revoke
      one other session by id, so a web row is enforced on that browser's next
      dashboard navigation (see the check in app/dashboard/layout.jsx). When the
      row is the caller's own, we can do better and end the session immediately.
    */
    if (deviceId === thisDevice) {
      const supabase = await getSupabase()
      await supabase.auth.signOut()
      return NextResponse.json({ ok: true, scope: 'self', signedOut: true })
    }

    return NextResponse.json({ ok: true, scope: 'one' })
  } catch (e) {
    return NextResponse.json(
      { error: `Could not sign that device out: ${e.message}` },
      { status: 500 },
    )
  }
}
