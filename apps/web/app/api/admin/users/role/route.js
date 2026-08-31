import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth'
import { setRole } from '@/lib/metering'
import { fail } from '@/lib/http'

/*
  ADMIN SPLIT 2026-09-01 ─ this route had no guard at all.

  It used to take whatever arrived and hand it to the service-role client:

  // import { createAdminClient } from '@/lib/supabase-server'
  //
  //     const { userId, role } = await request.json()
  //     if (!userId || !role)
  //       return NextResponse.json({ error: 'userId and role required' }, { status: 400 })
  //
  //     const admin = createAdminClient()
  //     const { error } = await admin
  //       .from('profiles')
  //       .update({ role })
  //       .eq('id', userId)
  //
  //     if (error) throw error
  //     return NextResponse.json({ success: true })
  //   } catch (e) {
  //     return NextResponse.json({ error: e.message }, { status: 500 })
  //   }

  Three separate defects, and the first is the one that matters:

  1. NOTHING STOPPED AN ADMIN REMOVING THEIR OWN ROLE. app/admin/users/page.jsx
     lists every profile including the caller's, UserActions renders
     "Remove admin" on that row, and this update bypasses RLS. A sole admin
     clicking it left the system with no admin and no in-product way back —
     only the Supabase SQL editor.

  2. `role` was never validated. The DB check constraint caught it, but as a
     thrown driver error, so a client mistake surfaced as a 500.

  3. `e.message` went to the browser verbatim. See fail() in lib/http.js.

  The guard is NOT here, and that is deliberate: it is in the database, in
  profile_set_role() and the profiles_keep_one_admin triggers
  (20260901035900_admin_split_audit.sql). A check in this file would only cover
  requests that come through this file, and it would be a read-then-write race
  besides — two admins demoting each other at the same moment would each read the
  other as still an admin and both writes would land. This route's job is to
  validate its input and turn a refusal into an HTTP status.
*/

const ROLES = ['user', 'admin']

// Rejected here rather than left to the database, so a malformed id is a 400
// naming the field instead of a 500 carrying `invalid input syntax for type
// uuid` from Postgres.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/*
  The refusal codes profile_set_role() can return, mapped to what they actually
  mean over HTTP. 409 for the two guards rather than 400: the request is
  well-formed and the caller is allowed to make it — it conflicts with the state
  of the system, and it would succeed once another admin exists.
*/
const STATUS = {
  bad_role:    400,
  no_user:     404,
  self_demote: 409,
  last_admin:  409,
}

export async function POST(request) {
  try {
    const gate = await requireAdminApi()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

    const { userId, role } = await request.json()

    if (typeof userId !== 'string' || !UUID.test(userId))
      return NextResponse.json({ error: 'userId must be a uuid' }, { status: 400 })

    // Shape borrowed from app/api/admin/subscription/route.js, which has
    // validated its `kind` against a known list since it was written. This route
    // was the odd one out, not the precedent.
    if (!ROLES.includes(role))
      return NextResponse.json(
        { error: `role must be one of ${ROLES.join(', ')}` },
        { status: 400 },
      )

    const result = await setRole({ userId, role, actorId: gate.user.id })

    if (!result?.ok) {
      return NextResponse.json(
        { error: result?.reason || 'Could not change the role' },
        { status: STATUS[result?.code] ?? 400 },
      )
    }

    // `changed` is false when the role already had this value. Reported rather
    // than smoothed over, so the UI can tell "done" from "nothing to do".
    return NextResponse.json({ success: true, role: result.role, changed: result.changed })
  } catch (e) {
    return fail(e, 'admin/users/role')
  }
}
