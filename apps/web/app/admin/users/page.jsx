import { createAdminClient } from '@/lib/supabase-server'
import UserActions from './UserActions'
import { Card, Badge, PageHeader, EmptyState } from '@/components/ui'

export const metadata = { title: 'Users — Admin' }

export default async function UsersPage() {
  // Service-role client so every account is visible, not just the caller's own.
  const supabase = createAdminClient()

  const { data: users, error } = await supabase
    .from('profiles')
    .select('*, licenses ( id, license_key, plan, status, created_at, expires_at )')
    .order('created_at', { ascending: false })

  if (error) console.error('Admin users error:', error)

  const TH = 'px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint'

  return (
    <div>
      <PageHeader
        title="Users"
        lede={`${users?.length || 0} account${users?.length === 1 ? '' : 's'}`}
      />

      <Card padded={false}>
        {!users?.length ? (
          <EmptyState icon="users" title="No users yet" description="Accounts appear here as people sign up." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[14px]">
              <thead>
                <tr className="border-b border-line">
                  <th className={TH}>User</th>
                  <th className={TH}>Role</th>
                  <th className={TH}>Licence</th>
                  <th className={TH}>Joined</th>
                  <th className={`${TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {users.map(u => {
                  const active = u.licenses?.find(l => l.status === 'active')
                  return (
                    <tr key={u.id} className="transition-colors hover:bg-canvas">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-canvas-2 text-[12px] font-medium text-ink-soft">
                            {(u.full_name || u.email || '?')[0]?.toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{u.full_name || '—'}</p>
                            <p className="truncate text-[12px] text-faint">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge tone={u.role === 'admin' ? 'accent' : 'neutral'}>{u.role}</Badge>
                      </td>
                      <td className="px-6 py-3.5">
                        {active
                          ? <Badge tone="positive">{active.plan}</Badge>
                          : <span className="text-[13px] text-faint">None</span>}
                      </td>
                      <td className="px-6 py-3.5 text-[13px] text-muted" data-numeric>
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3.5">
                        <UserActions user={u} activeLicense={active} />
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
