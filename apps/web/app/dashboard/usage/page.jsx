import { createClient } from '@/lib/supabase-server'
import UsageCard from '@/components/dashboard/UsageCard'

export const metadata = { title: 'Usage — Interview Assistant' }

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
    .from('usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const thisMonth = sessions?.filter(s => new Date(s.created_at) >= startOfMonth).length ?? 0
  const lastUsed  = sessions?.[0]?.created_at

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Usage</h1>
        <p className="text-gray-500 text-sm mt-1">Your interview sessions</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <UsageCard label="Total sessions" value={total || 0} icon="📊" sub="All time" />
        <UsageCard label="This month"     value={thisMonth} icon="📈" sub={now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          color="text-purple-600" bg="bg-purple-50" />
        <UsageCard label="Last session"   value={lastUsed ? new Date(lastUsed).toLocaleDateString() : '—'} icon="🕒"
          sub={lastUsed ? new Date(lastUsed).toLocaleTimeString() : 'No sessions yet'}
          color="text-green-600" bg="bg-green-50" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Recent sessions</h2>
        </div>

        {!sessions?.length ? (
          <div className="px-6 py-12 text-center">
            <div className="text-3xl mb-3">📭</div>
            <p className="text-sm text-gray-500">No sessions yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Sessions appear here once you start using the desktop app.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50">
                  <th className="px-6 py-3">Action</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-900">{s.action || 'Session'}</td>
                    <td className="px-6 py-3 text-gray-500">{new Date(s.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-3 text-gray-400">{new Date(s.created_at).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
