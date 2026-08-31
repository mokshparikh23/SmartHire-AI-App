import { requireUser, getSupabase } from '@/lib/auth'
import { formatBalance, END_REASON_LABEL } from '@/lib/credits'
import { sweepStaleSessions } from '@/lib/metering'
import { Card, Stat, PageHeader, EmptyState, Badge, Button, TH } from 'smarthire-ui'
import PageTransition from '@/components/ui/PageTransition'

export const metadata = { title: 'Sessions — Smart Hire AI' }

/**
 * Where the time went.
 *
 * This page used to list rows from `usage` — one per AI request — under the
 * heading "Sessions". Under per-minute billing that is a different quantity from
 * the one people pay for, so it now reads interview_sessions and shows minutes.
 *
 * end_reason is shown in plain words rather than hidden, because this is the
 * page someone opens when they think they have been charged for time they did
 * not use, and "Connection lost" answers that question on its own.
 */
const REASON_TONE = {
  client_stop:     'neutral',
  out_of_credits:  'critical',
  stale:           'warning',
  superseded:      'warning',
  license_revoked: 'critical',
  request_limit:   'warning',
  admin_stop:      'warning',
}

export default async function SessionsPage() {
  // PIVOT 2026-08-29: the un-guarded getUser() below dereferenced user.id on the
  // next line, which threw a TypeError on a lapsed session. requireUser()
  // redirects instead, and both calls are cache()d across the render pass.
  //
  // const supabase = await createClient()
  // const { data: { user } } = await supabase.auth.getUser()
  const user = await requireUser()
  const supabase = await getSupabase()

  /* HONEST-LIVE 2026-08-30 ────────────────────────────────────────────────────
     This page renders "Live now" from `ended_at is null`, and nothing on the web
     ever ran the reconciler: sweep_stale_sessions() rides along on
     license_snapshot() and session_start(), which only the desktop's validate,
     stream and start calls reach. So a user whose app had crashed opened the one
     page that answers "what was I charged for" and was told a session dead three
     minutes in was still running.

     Awaited and ordered BEFORE the select below — as a Suspense'd sibling it
     would race its own render. It fails open: a sweep failure must never take
     the sessions list down with it, and the next licence tick will do the same
     work anyway.

     Deliberately not in proxy.js — the dashboard layout notes that per-request
     database work there was the main cause of slow navigation, and proxy runs on
     prefetches too. Once per real render of this page is the right frequency. */
  await sweepStaleSessions(user.id).catch(() => {})

  // Month boundaries computed in UTC rather than from the web server's local
  // clock, which was the previous behaviour and quietly differed between a
  // developer's machine and production.
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const [{ data: sessions }, { count: answers }] = await Promise.all([
    supabase.from('interview_sessions')
      .select('id, started_at, ended_at, minutes_elapsed, minutes_charged, metered, end_reason, ai_requests')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(50),
    supabase.from('usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('action', 'answer'),
  ])

  const rows = sessions ?? []
  const totalMinutes = rows.reduce((sum, s) => sum + (s.minutes_elapsed || 0), 0)
  const monthMinutes = rows
    .filter(s => s.started_at >= monthStart)
    .reduce((sum, s) => sum + (s.minutes_elapsed || 0), 0)

  return (
    <PageTransition>
      <div>
        <PageHeader title="Sessions" lede="Every interview you have run, and the minutes it used." />

        <div className="grid gap-5 sm:grid-cols-3">
          <Stat
            label="Time used" value={formatBalance(totalMinutes)}
            sub={`Across ${rows.length} session${rows.length === 1 ? '' : 's'}`}
            icon="clock"
          />
          <Stat
            label="This month" value={formatBalance(monthMinutes)}
            sub={now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            icon="chart" tone="accent"
          />
          {/* Kept because it is genuinely interesting, but placed after minutes so
              it can no longer be mistaken for the billing number. */}
          <Stat
            label="Answers generated" value={answers || 0}
            sub="Questions the assistant answered"
            icon="bolt" tone="neutral"
          />
        </div>

        <Card className="mt-5" padded={false}>
          <div className="border-b border-line px-6 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Recent sessions</h2>
            <p className="mt-0.5 text-[12px] text-faint">Newest first</p>
          </div>

          {!rows.length ? (
            <EmptyState
              icon="clock"
              title="No sessions yet"
              description="Start a session in the desktop app and it appears here with the minutes it used."
              action={<Button href="/dashboard/billing" variant="secondary" iconRight="arrowRight">See plans</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[14px]">
                <thead>
                  <tr className="border-b border-line-soft">
                    <th className={TH}>Date</th>
                    <th className={TH}>Started</th>
                    <th className={TH}>Length</th>
                    <th className={TH}>Charged</th>
                    <th className={TH}>Ended</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {rows.map(s => (
                    <tr key={s.id} className="transition-colors hover:bg-canvas">
                      <td className="px-6 py-3.5 text-muted" data-numeric>
                        {new Date(s.started_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3.5 text-faint" data-numeric>
                        {new Date(s.started_at).toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-3.5 text-ink" data-numeric>
                        {formatBalance(s.minutes_elapsed)}
                      </td>
                      <td className="px-6 py-3.5" data-numeric>
                        {s.metered
                          ? <span className="text-ink">{formatBalance(s.minutes_charged)}</span>
                          : <Badge tone="accent">Unlimited</Badge>}
                      </td>
                      <td className="px-6 py-3.5">
                        {s.ended_at
                          ? <Badge tone={REASON_TONE[s.end_reason] || 'neutral'}>
                              {END_REASON_LABEL[s.end_reason] || s.end_reason}
                            </Badge>
                          : <Badge tone="positive">Live now</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </PageTransition>
  )
}
