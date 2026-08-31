import { createAdminClient } from '@/lib/supabase-server'
import { requireAdminPage } from '@/lib/auth'
import UserActions from './UserActions'
import { Card, Badge, PageHeader, EmptyState, TH } from 'smarthire-ui'
import { formatBalance, balanceTone } from '@/lib/credits'

export const metadata = { title: 'Users — Admin' }

export default async function UsersPage() {
  // The gate has to be HERE, not only in app/admin/layout.jsx. Layouts are not
  // re-executed on sibling client navigation, and whether one re-renders is
  // decided by the client-supplied `next-router-state-tree` header — so the
  // layout alone does not stop a crafted RSC request reaching this query, which
  // returns every account's email and licence key.
  await requireAdminPage()

  // Service-role client so every account is visible, not just the caller's own.
  const supabase = createAdminClient()

  const { data: users, error } = await supabase
    .from('profiles')
    .select(`*,
      licenses ( id, license_key, status, created_at ),
      credit_wallets ( minutes_balance, subscription_kind, subscription_status, subscription_period_end )`)
    .order('created_at', { ascending: false })

  if (error) console.error('Admin users error:', error)

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
                  <th className={TH}>Balance</th>
                  <th className={TH}>Joined</th>
                  <th className={`${TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {users.map(u => {
                  const active = u.licenses?.find(l => l.status === 'active')
                  const wallet = u.credit_wallets
                  const minutes = wallet?.minutes_balance ?? 0
                  const unlimited =
                    !!wallet?.subscription_kind &&
                    ['active', 'past_due'].includes(wallet.subscription_status) &&
                    !!wallet.subscription_period_end &&
                    new Date(wallet.subscription_period_end) > new Date()
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
                          ? <Badge tone="positive">Active</Badge>
                          : <span className="text-[13px] text-faint">None</span>}
                      </td>
                      <td className="px-6 py-3.5">
                        {unlimited
                          ? <Badge tone="accent">{wallet.subscription_kind}</Badge>
                          : minutes > 0
                            ? <span className="text-[13px] font-medium text-ink" data-numeric>
                                {formatBalance(minutes)}
                              </span>
                            : <Badge tone={balanceTone(minutes)}>Empty</Badge>}
                      </td>
                      <td className="px-6 py-3.5 text-[13px] text-muted" data-numeric>
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3.5">
                        <UserActions user={u} activeLicense={active} wallet={wallet} />
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
