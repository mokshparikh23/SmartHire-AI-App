import { createBrowserClient } from '@supabase/ssr'
import { assertPublishableKey } from '@smarthire/data/public-key'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    // KEY-SHAPE 2026-09-06: guarded here for the same reason as in
    // apps/admin/lib/supabase.js, even though it was the admin project that was
    // misconfigured — the two dashboards take the same two variables, so the
    // typo that hit one is available to the other.
    assertPublishableKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  )
}
