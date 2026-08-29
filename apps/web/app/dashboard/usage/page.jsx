import { createClient } from '@/lib/supabase-server'
import { Card, Stat, PageHeader, EmptyState, Badge } from '@/components/ui'

export const metadata = { title: 'Usage — Interview Assistant' }

const ACTION_LABELS = {
  answer:     ['Answer generated', 'accent'],
  transcribe: ['Question transcribed', 'neutral'],
}

export default async function UsagePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: sessions } = await supabase
    .from('usage')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const { count: total } = await supabase
    .from('usage').select('*', { count: 'exact', head: true }).eq('user_id', user.id)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const thisMonth = sessions?.filter(s => new Date(s.created_at) >= monthStart).length ?? 0
  const lastUsed = sessions?.[0]?.created_at

  return (
    <div>
      <PageHeader title="Usage" lede="Every question answered and transcribed for you." />

      <div className="grid gap-5 sm:grid-cols-3">
        <Stat label="Total" value={total || 0} sub="All time" icon="chart" />
        <Stat
          label="This month" value={thisMonth}
          sub={now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          icon="bolt" tone="accent"
        />
        <Stat
          label="Last activity"
          value={lastUsed ? new Date(lastUsed).toLocaleDateString() : '—'}
          sub={lastUsed ? new Date(lastUsed).toLocaleTimeString() : 'Nothing yet'}
          icon="clock" tone="neutral"
        />
      </div>

      <Card className="mt-5" padded={false}>
        <div className="border-b border-line px-6 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Recent activity</h2>
        </div>

        {!sessions?.length ? (
          <EmptyState
            title="Nothing here yet"
            description="Activity appears once you start a session in the desktop app."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[14px]">
              <thead>
                <tr className="border-b border-line-soft">
                  <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Action</th>
                  <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Date</th>
                  <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {sessions.map(s => {
                  const [label, tone] = ACTION_LABELS[s.action] || [s.action || 'Session', 'neutral']
                  return (
                    <tr key={s.id} className="transition-colors hover:bg-canvas">
                      <td className="px-6 py-3"><Badge tone={tone}>{label}</Badge></td>
                      <td className="px-6 py-3 text-muted">{new Date(s.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-3 text-faint">{new Date(s.created_at).toLocaleTimeString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
