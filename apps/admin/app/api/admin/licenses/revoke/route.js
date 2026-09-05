import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth'
import { createAdminClient } from '@smarthire/data/supabase-server'
import { fail } from '@/lib/http'

export async function POST(request) {
  try {
    const gate = await requireAdminApi()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

    const { licenseId } = await request.json()
    if (!licenseId)
      return NextResponse.json({ error: 'licenseId is required' }, { status: 400 })

    const { error } = await createAdminClient()
      .from('licenses')
      .update({ status: 'revoked' })
      .eq('id', licenseId)

    if (error) throw error

    // Nothing to do about a session running on this key: session_heartbeat()
    // checks the licence status on every beat and closes the session itself,
    // billed to that moment. That happens server-side within one heartbeat and
    // does not depend on the SSE revocation frame reaching the desktop app.
    //
    // Closing it from here as well would mean settling against this server's
    // clock rather than the database's, for the sake of at most twenty seconds.
    return NextResponse.json({ success: true })
  // ADMIN SPLIT 2026-09-01: fail() logs the same detail this already logged and
  // returns a constant instead of e.message. See lib/http.js.
  // } catch (e) {
  //   console.error('Revoke license error:', e)
  //   return NextResponse.json({ error: e.message }, { status: 500 })
  // }
  } catch (e) {
    return fail(e, 'admin/licenses/revoke')
  }
}
