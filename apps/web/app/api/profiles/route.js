import { CORS, jsonError } from '@/lib/http'
import { requireLicense } from '@/lib/ai'
import { createAdminClient } from 'smarthire-data/supabase-server'
// CONTEXT 2026-08-31: the compressed resume is computed server-side, where the
// prompt-injection stripping in lib/resume.js's clean() already lives.
import { briefResume, normalizeParsed } from '@/lib/resume'

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
 * The resume text is returned in full. That is the point: buildSystemPrompt()
 * on the desktop needs both the text and resume_consent to decide whether the
 * RESUME section is assembled at all, and the flag is worthless without the
 * text it governs travelling alongside it.
 *
 * ANSWER-STYLE 2026-08-30: answer_style travels with the rest of the context. It
 * is the candidate's register, not the interviewer's preference, which is why it
 * is a column on this row and arrives through this list rather than through the
 * licence snapshot. The desktop is free to override it for the session in front
 * of it; nothing here writes back.
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
      // ANSWER-STYLE 2026-08-30: answer_style joins the projection. This route
      // names its columns rather than using select('*'), which is right — a
      // licence-authenticated caller should not receive columns nobody decided
      // to send it — but it means a new column is invisible here by default, and
      // the failure is silent: the desktop would simply see `undefined`, fall
      // back to its own default, and keep writing in the old register while the
      // dashboard insisted the setting had saved.
      // .select('id, candidate_name, company, role, resume, resume_consent, job_description, updated_at')
      /* CONTEXT 2026-08-31: resume_parsed and company_domain join the
         projection. Both have existed on the row since their migrations and
         were simply never selected, so the desktop could not see them — the
         exact silent-by-default failure the note above describes.

         resume_parsed is the structured record; only its compressed projection
         travels (see briefResume), never the raw jsonb. */
      // .select('id, candidate_name, company, role, resume, resume_consent, answer_style, job_description, updated_at')
      .select('id, candidate_name, company, company_domain, role, resume, resume_parsed, resume_consent, answer_style, job_description, updated_at')
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
      companyDomain:   r.company_domain || '',   // CONTEXT 2026-08-31
      role:            r.role || '',
      resume:          r.resume || '',
      /* CONTEXT 2026-08-31: derived here, not shipped raw. Coerced at the
         boundary for the same reason answerStyle is below — the desktop should
         never have to decide what a malformed parse means mid-interview. It is
         a projection of the resume and carries no consent of its own;
         buildSystemPrompt() gates it on the same useResume condition as the
         full text, in the same expression. */
      resumeBrief:     briefResume(normalizeParsed(r.resume_parsed)),
      resumeConsent:   r.resume_consent === true,
      // ANSWER-STYLE 2026-08-30: normalised here rather than passed through. The
      // CHECK constraint means a row cannot hold a third value, but it can still
      // arrive as null from a service-role write that predates or skips the
      // column — and the desktop should never have to decide what an
      // unrecognised register means with an interview already running. Deciding
      // it once, on the server, means the desktop only ever receives a value it
      // has a prompt for. Same shape as the `=== true` on the line above, and
      // for the same reason: coerce at the boundary, not at every reader.
      answerStyle:     r.answer_style === 'desi' ? 'desi' : 'plain',
      jobDescription:  r.job_description || '',
      updatedAt:       r.updated_at,
    })),
  }, { headers: CORS })
}
