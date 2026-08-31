import { createAdminClient } from '@/lib/supabase-server'
import { requireAdminPage } from '@/lib/auth'
import { Card, Badge, Stat, PageHeader, EmptyState } from 'smarthire-ui'

export const metadata = { title: 'Usage — Admin' }

const ACTION_LABELS = {
  answer:     ['Answer generated', 'accent'],
  transcribe: ['Question transcribed', 'neutral'],
}

const TH = 'px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint'

export default async function AdminUsagePage() {
  // See app/admin/users/page.jsx — the layout is not a sufficient boundary for a
  // service-role query.
  await requireAdminPage()

  const supabase = createAdminClient()

  const [{ data: usage }, { count: total }] = await Promise.all([
    supabase
      .from('usage')
      .select('*, profiles(email, full_name)')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('usage').select('*', { count: 'exact', head: true }),
  ])

  // Aggregated from the 100 most recent rows, which is what the query returns.
  const byUser = {}
  usage?.forEach(u => {
    const key = u.profiles?.email || 'unknown'
    byUser[key] = (byUser[key] || 0) + 1
  })
  const topUsers = Object.entries(byUser).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const uniqueUsers = Object.keys(byUser).length
  const avg = uniqueUsers ? Math.round((usage?.length || 0) / uniqueUsers) : 0

  return (
    <div>
      <PageHeader title="Usage" lede="AI requests across every account." />

      <div className="grid gap-5 sm:grid-cols-3">
        <Stat label="Total requests" value={total || 0} sub="All time" icon="chart" />
        <Stat label="Active users" value={uniqueUsers} sub="In the last 100 requests" icon="users" tone="accent" />
        <Stat label="Average each" value={avg} sub="In the last 100 requests" icon="bolt" tone="positive" />
      </div>

      {topUsers.length > 0 && (
        <Card className="mt-5">
          <h2 className="text-[15px] font-semibold text-ink">Most active</h2>
          <p className="mt-1 text-[13px] text-muted">By share of the 100 most recent requests.</p>
          <ul className="mt-5 space-y-3.5">
            {topUsers.map(([email, count]) => {
              const pct = Math.round((count / topUsers[0][1]) * 100)
              return (
                <li key={email}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-4">
                    <span className="truncate text-[13px] text-ink">{email}</span>
                    <span className="shrink-0 text-[13px] text-muted" data-numeric>{count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-canvas-2">
                    <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Card className="mt-5" padded={false}>
        <div className="border-b border-line px-6 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Recent requests</h2>
          <p className="mt-0.5 text-[12px] text-faint">Latest 100</p>
        </div>

        {!usage?.length ? (
          <EmptyState
            title="No usage yet"
            description="Rows appear here once someone runs a session in the desktop app."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[14px]">
              <thead>
                <tr className="border-b border-line">
                  <th className={TH}>User</th>
                  <th className={TH}>Action</th>
                  <th className={TH}>When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {usage.map(u => {
                  const [label, tone] = ACTION_LABELS[u.action] || [u.action || 'Session', 'neutral']
                  return (
                    <tr key={u.id} className="transition-colors hover:bg-canvas">
                      <td className="px-6 py-3.5">
                        <p className="truncate font-medium text-ink">{u.profiles?.full_name || '—'}</p>
                        <p className="truncate text-[12px] text-faint">{u.profiles?.email || 'unknown'}</p>
                      </td>
                      <td className="px-6 py-3.5"><Badge tone={tone}>{label}</Badge></td>
                      <td className="px-6 py-3.5 text-[13px] text-muted" data-numeric>
                        {new Date(u.created_at).toLocaleString()}
                      </td>
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
