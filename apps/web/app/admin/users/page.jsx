import { createAdminClient } from '@/lib/supabase-server'
import UserActions from './UserActions'

export const metadata = { title: 'Users — Admin' }

export default async function UsersPage() {
  // Use admin client to bypass RLS and see ALL users
  const supabase = createAdminClient()

  const { data: users, error } = await supabase
    .from('profiles')
    .select(`
      *,
      licenses (
        id, license_key, plan, status, created_at, expires_at
      )
    `)
    .order('created_at', { ascending: false })

  if (error) console.error('Admin users error:', error)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="text-gray-500 text-sm mt-1">{users?.length || 0} total users</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 font-semibold">User</th>
                <th className="px-6 py-4 font-semibold">Role</th>
                <th className="px-6 py-4 font-semibold">License</th>
                <th className="px-6 py-4 font-semibold">Plan</th>
                <th className="px-6 py-4 font-semibold">Joined</th>
                <th className="px-6 py-4 font-semibold min-w-[280px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users?.map(user => {
                const activeLicense = user.licenses?.find(l => l.status === 'active')
                return (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white text-sm font-bold shrink-0">
                          {user.email?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{user.full_name || '—'}</p>
                          <p className="text-xs text-gray-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        user.role === 'admin'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {activeLicense
                        ? <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-700">{activeLicense.license_key}</code>
                        : <span className="text-xs text-gray-400">No license</span>
                      }
                    </td>
                    <td className="px-6 py-4">
                      {activeLicense
                        ? <span className="text-xs font-semibold bg-green-100 text-green-700 px-2.5 py-1 rounded-full capitalize">{activeLicense.plan}</span>
                        : <span className="text-xs text-gray-400">—</span>
                      }
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <UserActions user={user} activeLicense={activeLicense} />
                    </td>
                  </tr>
                )
              })}
              {!users?.length && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}