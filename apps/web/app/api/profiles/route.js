import { CORS, jsonError } from '@/lib/http'
import { requireLicense } from '@/lib/ai'
import { createAdminClient } from '@/lib/supabase-server'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

/**
 * SETUP-TO-WEB 2026-08-30
 *
 * The interview profiles belonging to a licence, for the desktop launcher.
 *
 * POST, not GET, and the licence key is in the body rather than the query
 * string — the same shape as /api/license/validate. A GET would put a live
 * credential into request logs and browser history for no benefit; the desktop
 * is not a browser and gains nothing from cacheability here.
 *
 * requireLicense, not requireSession: picking which interview to run happens
 * BEFORE a metered session exists, so gating this on a session id would make it
 * unreachable. It is also free — no model call — so there is nothing to meter.
 *
 * The résumé text is returned in full. That is the point: buildSystemPrompt()
 * on the desktop needs both the text and resume_consent to decide whether the
 * RESUME section is assembled at all, and the flag is worthless without the
 * text it governs travelling alongside it.
 */
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return jsonError('Body must be JSON', 400)
  }

  const gate = await requireLicense(body?.licenseKey)
  if (!gate.ok) return jsonError(gate.reason, gate.status)

  // validateLicense resolves the licence to its owner (lib/license.js:60); the
  // desktop never sends a user id, so there is no way for a caller to ask for
  // someone else's rows.
  const userId = gate.license?.userId
  if (!userId) {
    return jsonError('Licence is not linked to an account', 403, { code: 'no_owner' })
  }

  let rows
  try {
    const { data, error } = await createAdminClient()
      .from('interview_profiles')
      .select('id, candidate_name, company, role, resume, resume_consent, job_description, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)
    rows = data ?? []
  } catch (e) {
    // 503, not 403: a database wobble must not read to the client as a bad
    // licence, which is what makes the desktop sign the user out.
    return jsonError(`Could not load interviews: ${e.message}`, 503)
  }

  return Response.json({
    ok: true,
    profiles: rows.map(r => ({
      id:              r.id,
      candidateName:   r.candidate_name,
      company:         r.company || '',
      role:            r.role || '',
      resume:          r.resume || '',
      resumeConsent:   r.resume_consent === true,
      jobDescription:  r.job_description || '',
      updatedAt:       r.updated_at,
    })),
  }, { headers: CORS })
}
