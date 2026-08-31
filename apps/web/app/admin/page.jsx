import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase-server'
import { requireAdminPage } from '@/lib/auth'
import Icon from 'smarthire-ui/Icon'
import { Card, Badge, Stat, PageHeader, EmptyState } from 'smarthire-ui'
import { formatBalance } from '@/lib/credits'

export const metadata = { title: 'Admin — Smart Hire AI' }

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
  // See app/admin/users/page.jsx — the layout is not a sufficient boundary for a
  // service-role query.
  await requireAdminPage()

  const supabase = createAdminClient()

  const [
    { count: totalUsers },
    { count: totalLicenses },
    { count: activeLicenses },
    { count: totalUsage },
    { data: recentUsers },
    { data: recentLicenses },
    { data: wallets },
    { data: drift },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('licenses').select('*', { count: 'exact', head: true }),
    supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('usage').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(5),
    supabase.from('licenses')
      .select('*, profiles(email, full_name, credit_wallets(minutes_balance, subscription_kind))')
      .order('created_at', { ascending: false }).limit(5),
    supabase.from('credit_wallets')
      .select('minutes_balance, minutes_spent_total, subscription_kind, subscription_status, subscription_period_end'),
    // The wallet is a running total and the ledger is the source of truth. A
    // non-zero count here means a write escaped the metering functions.
    supabase.from('credit_drift').select('user_id'),
  ])

  const outstanding = (wallets ?? []).reduce((n, w) => n + (w.minutes_balance || 0), 0)
  const consumed    = (wallets ?? []).reduce((n, w) => n + (w.minutes_spent_total || 0), 0)
  const subscribers = (wallets ?? []).filter(w =>
    w.subscription_kind &&
    ['active', 'past_due'].includes(w.subscription_status) &&
    w.subscription_period_end && new Date(w.subscription_period_end) > new Date()).length

  return (
    <div>
      <PageHeader title="Overview" lede="Everything happening across the app." />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Users" value={totalUsers || 0} sub="Registered accounts" icon="users" />
        {/* Credits outstanding is a LIABILITY — hours already paid for and not
            yet delivered — so it gets the warning tone rather than reading as a
            success metric. */}
        <Stat
          label="Credits outstanding"
          value={Math.round(outstanding / 60).toLocaleString()}
          sub={`${outstanding.toLocaleString()} minutes unspent`}
          icon="coin" tone="warning"
        />
        <Stat
          label="Minutes served"
          value={consumed.toLocaleString()}
          sub={`${subscribers} on unlimited`}
          icon="clock" tone="accent"
        />
        <Stat
          label="Active licences"
          value={activeLicenses || 0}
          sub={`${(totalLicenses || 0) - (activeLicenses || 0)} revoked · ${totalUsage || 0} AI requests`}
          icon="key" tone="positive"
        />
      </div>

      {drift?.length > 0 && (
        <Card className="mt-5 border-critical/25 bg-critical-soft">
          <p className="flex items-center gap-2.5 text-[14px] text-ink-soft">
            <Icon name="warning" size={16} className="shrink-0 text-critical" />
            <span>
              <strong className="font-semibold text-ink">{drift.length}</strong> wallet
              {drift.length === 1 ? '' : 's'} disagree with the credit ledger. A balance was
              written outside the metering functions — check public.credit_drift.
            </span>
          </p>
        </Card>
      )}

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
                  {l.profiles?.credit_wallets?.subscription_kind
                    ? <Badge tone="accent">Unlimited</Badge>
                    : <Badge tone="neutral" className="tabular-nums">
                        {formatBalance(l.profiles?.credit_wallets?.minutes_balance)}
                      </Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {[
          { href: '/admin/licenses', title: 'Issue a licence', desc: 'Assign a key and fund it',   icon: 'plus' },
          { href: '/admin/users',    title: 'Grant credits',   desc: 'Top up, comp a subscription', icon: 'coin' },
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
