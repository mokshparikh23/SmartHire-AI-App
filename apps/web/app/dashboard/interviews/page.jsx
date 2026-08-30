import { requireUser, getSupabase } from '@/lib/auth'
import { PageHeader } from '@/components/ui'
import PageTransition from '@/components/ui/PageTransition'
import InterviewProfiles from '@/components/dashboard/InterviewProfiles'

export const metadata = { title: 'Interviews — Smart Hire AI' }

/**
 * SETUP-TO-WEB 2026-08-30
 *
 * Interview setup used to be a three-step wizard inside the desktop app, with
 * everything held in localStorage. It lives here now: one row per interview,
 * created once, then picked in the desktop launcher.
 *
 * CONCEPT 2026-08-30: a row was one CANDIDATE when the app was the interviewer's.
 * It is one INTERVIEW now — the reader is the candidate, so what varies between
 * rows is the company and the round, not the person. Only the wording changed;
 * `candidate_name` is still the column, and the note in InterviewProfiles.jsx
 * says why.
 *
 * The résumé checkbox came with it. It is asked here, at the moment the résumé
 * is added, rather than before every session — which is the whole point of the
 * move. The gate that acts on the answer stays in buildSystemPrompt() on the
 * desktop.
 */
export default async function InterviewsPage() {
  const user = await requireUser()
  const supabase = await getSupabase()

  const { data: profiles } = await supabase
    .from('interview_profiles')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <PageTransition>
      <div>
        <PageHeader
          title="Interviews"
          // lede="Set up a candidate here once. The desktop app just picks one and starts."
          lede="Set an interview up here once. The desktop app just picks one and starts."
        />
        <InterviewProfiles initialProfiles={profiles ?? []} userId={user.id} />
      </div>
    </PageTransition>
  )
}
