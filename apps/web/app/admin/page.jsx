import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase-server'
import Icon from '@/components/ui/Icon'
import { Card, Badge, Stat, PageHeader, EmptyState } from '@/components/ui'

export const metadata = { title: 'Admin — Interview Assistant' }

const PLAN_TONE = { lifetime: 'warning', yearly: 'accent', monthly: 'positive' }

function PanelHeader({ title, sub, href }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-[12px] text-faint">{sub}</p>
      </div>
      <Link
        href={href}
        className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-muted transition-colors hover:text-ink"
      >
        View all
        <Icon name="arrowRight" size={14} />
      </Link>
    </div>
  )
}

export default async function AdminPage() {
  const supabase = createAdminClient()

  const [
    { count: totalUsers },
    { count: totalLicenses },
    { count: activeLicenses },
    { count: totalUsage },
    { data: recentUsers },
    { data: recentLicenses },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('licenses').select('*', { count: 'exact', head: true }),
    supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('usage').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(5),
    supabase.from('licenses').select('*, profiles(email, full_name)').order('created_at', { ascending: false }).limit(5),
  ])

  return (
    <div>
      <PageHeader title="Overview" lede="Everything happening across the app." />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Users"            value={totalUsers || 0}     sub="Registered accounts" icon="users" />
        <Stat label="Active licences"  value={activeLicenses || 0} sub="Currently valid"     icon="key"   tone="positive" />
        <Stat
          label="Inactive licences"
          value={(totalLicenses || 0) - (activeLicenses || 0)}
          sub="Revoked or expired" icon="ban" tone="critical"
        />
        <Stat label="AI requests"      value={totalUsage || 0}     sub="All time"            icon="chart" tone="accent" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card padded={false}>
          <PanelHeader title="Recent signups" sub="Newest accounts" href="/admin/users" />
          {!recentUsers?.length ? (
            <EmptyState icon="users" title="No users yet" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {recentUsers.map(u => (
                <li key={u.id} className="flex items-center gap-3 px-6 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-canvas-2 text-[12px] font-medium text-ink-soft">
                    {(u.full_name || u.email || '?')[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">{u.full_name || u.email || '—'}</p>
                    <p className="truncate text-[11px] text-faint">
                      {u.full_name ? u.email : new Date(u.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {u.role === 'admin' && <Badge tone="accent">admin</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padded={false}>
          <PanelHeader title="Recent licences" sub="Newest issued" href="/admin/licenses" />
          {!recentLicenses?.length ? (
            <EmptyState icon="key" title="No licences yet" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {recentLicenses.map(l => (
                <li key={l.id} className="flex items-center gap-3 px-6 py-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      l.status === 'active' ? 'bg-positive-soft text-positive' : 'bg-critical-soft text-critical'
                    }`}
                  >
                    <Icon name={l.status === 'active' ? 'check' : 'ban'} size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">{l.profiles?.email || '—'}</p>
                    <p className="truncate font-mono text-[11px] text-faint" data-numeric>{l.license_key}</p>
                  </div>
                  <Badge tone={PLAN_TONE[l.plan] || 'neutral'}>{l.plan}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {[
          { href: '/admin/licenses', title: 'Issue a licence', desc: 'Assign a licence to any user', icon: 'plus' },
          { href: '/admin/users',    title: 'Manage users',    desc: 'Review accounts and roles',    icon: 'users' },
        ].map(a => (
          <Link key={a.href} href={a.href} className="group">
            <Card className="flex items-center gap-4 transition-colors group-hover:border-ink/25">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-canvas-2 text-ink">
                <Icon name={a.icon} size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-ink">{a.title}</p>
                <p className="text-[13px] text-muted">{a.desc}</p>
              </div>
              <Icon name="arrowRight" size={16} className="ml-auto shrink-0 text-faint transition-colors group-hover:text-ink" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
