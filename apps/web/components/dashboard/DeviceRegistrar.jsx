'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const ONCE_KEY = 'shai_device_registered'

/**
 * Tells the server this browser exists, so it can appear in the device list and
 * be signed out from elsewhere.
 *
 * Renders nothing. Mounted once in the dashboard layout.
 *
 * WHY ONCE PER BROWSER SESSION rather than on every navigation: the answer only
 * changes when the browser changes, and the alternative is a database write on
 * every page view — the exact cost proxy.js was stripped down to avoid. The
 * sessionStorage flag resets when the tab closes, which is a reasonable
 * definition of "a new visit" and keeps last_seen_at meaningfully fresh.
 *
 * The whole storage access is wrapped: Safari in private mode and browsers with
 * site data blocked throw on sessionStorage rather than returning null. Failing
 * to read it should mean "register again", not "crash the dashboard".
 */
export default function DeviceRegistrar() {
  const router = useRouter()

  useEffect(() => {
    /*
      FIX 2026-08-30: the once-per-session guard used to wrap this whole effect,
      including the revoked check. sessionStorage SURVIVES A REFRESH in the same
      tab, so on F5 the effect returned immediately and the revoked branch never
      ran — which is exactly the "I signed the other machine out, refreshed it,
      and nothing happened" report.

      The guard now covers only the redundant part. Registration genuinely does
      not need repeating within a tab session; noticing that you have been signed
      out very much does, and it is the whole point of the component.

      // let done = false
      // try { done = sessionStorage.getItem(ONCE_KEY) === '1' } catch { done = false }
      // if (done) return
    */
    let registered = false
    try { registered = sessionStorage.getItem(ONCE_KEY) === '1' } catch { registered = false }

    let cancelled = false

    ;(async () => {
      try {
        /*
          `check` skips the write server-side but still returns the row's revoked
          state, so a refresh costs one indexed read rather than an upsert.
        */
        const res = await fetch(
          registered ? '/api/devices/register?check=1' : '/api/devices/register',
          { method: 'POST' },
        )
        if (!res.ok || cancelled) return

        const data = await res.json()
        try { sessionStorage.setItem(ONCE_KEY, '1') } catch { /* private mode */ }

        /*
          This browser was signed out from another device while it still held a
          valid Supabase session. Flagging the row cannot end that session on its
          own — there is no API to revoke one session by id — so the browser
          signs itself out when it notices.

          Signing out from the BROWSER client is what makes this work at all: it
          can write cookies, which a Server Component cannot. See the note in
          app/auth/device-signout/route.js.

          DeviceGate makes the same check server-side on every full page load.
          Both paths exist because neither covers everything: the layout does not
          re-render on client-side navigation between dashboard pages, and this
          effect does not re-run then either — but between them, any refresh or
          fresh load ejects a revoked browser.
        */
        if (data?.revoked && !cancelled) {
          await createClient().auth.signOut()
          router.replace('/login?signed_out=device')
        }
      } catch {
        // Offline, or the route is unreachable. Registration is not worth
        // interrupting the dashboard over; the next visit tries again.
      }
    })()

    return () => { cancelled = true }
  }, [router])

  return null
}
