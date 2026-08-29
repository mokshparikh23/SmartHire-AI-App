import { createAdminClient } from '@/lib/supabase-server'

export const metadata = { title: 'Usage — Admin' }

export default async function UsagePage() {
  const supabase = createAdminClient()

  const { data: usage } = await supabase
    .from('usage')
    .select('*, profiles(email, full_name)')
    .order('created_at', { ascending: false })
    .limit(100)

  const { count: totalSessions } = await supabase
    .from('usage')
    .select('*', { count: 'exact', head: true })

  // Group by user
  const byUser = {}
  usage?.forEach(u => {
    const email = u.profiles?.email || 'unknown'
    byUser[email] = (byUser[email] || 0) + 1
  })
  const topUsers = Object.entries(byUser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Usage Analytics</h1>
        <p className="text-gray-500 text-sm mt-1">Track how users are using the app</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {[
          { label: 'Total sessions', value: totalSessions || 0, icon: '📊', color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Unique users',   value: Object.keys(byUser).length, icon: '👥', color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Avg per user',   value: Object.keys(byUser).length ? Math.round((totalSessions || 0) / Object.keys(byUser).length) : 0, icon: '📈', color: 'text-green-600', bg: 'bg-green-50' }
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center text-xl mb-3`}>{s.icon}</div>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top users */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Top users</h2>
          </div>
          <div className="p-4 space-y-3">
            {topUsers.length > 0 ? topUsers.map(([email, count], i) => (
              <div key={email} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{email}</p>
                  <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                      style={{ width: `${Math.min(100, (count / (topUsers[0]?.[1] || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm font-bold text-gray-600 shrink-0">{count}</span>
              </div>
            )) : (
              <p className="text-sm text-gray-400 text-center py-4">No usage data yet</p>
            )}
          </div>
        </div>

        {/* Recent sessions */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Recent sessions</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {usage?.slice(0, 8).map(u => (
              <div key={u.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{u.profiles?.email || 'Unknown'}</p>
                  <p className="text-xs text-gray-400">{u.action || 'interview session'}</p>
                </div>
                <p className="text-xs text-gray-400">{new Date(u.created_at).toLocaleDateString()}</p>
              </div>
            ))}
            {!usage?.length && (
              <div className="px-6 py-10 text-center text-sm text-gray-400">No sessions yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}