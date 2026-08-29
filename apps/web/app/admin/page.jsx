import { createAdminClient } from '@/lib/supabase-server'
import Link from 'next/link'
import StatCard from '@/components/admin/StatCard'
import ActionCard from '@/components/admin/ActionCard'

export const metadata = { title: 'Admin — Interview Assistant' }

export default async function AdminPage() {
  const supabase = createAdminClient()

  const [
    { count: totalUsers },
    { count: totalLicenses },
    { count: activeLicenses },
    { data: recentUsers },
    { data: recentLicenses }
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('licenses').select('*', { count: 'exact', head: true }),
    supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(5),
    supabase.from('licenses').select('*, profiles(email, full_name)').order('created_at', { ascending: false }).limit(5)
  ])

  const stats = [
    { label: 'Total users',      value: totalUsers     || 0, change: '+12%', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ), color: '#6366f1', bg: 'rgba(99,102,241,0.1)', href: '/admin/users' },
    { label: 'Active licenses',  value: activeLicenses || 0, change: '+8%', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
      </svg>
    ), color: '#22c55e', bg: 'rgba(34,197,94,0.1)', href: '/admin/licenses' },
    { label: 'Total licenses',   value: totalLicenses  || 0, change: '+5%', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ), color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', href: '/admin/licenses' },
    { label: 'Expired licenses', value: (totalLicenses || 0) - (activeLicenses || 0), change: '', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ), color: '#ef4444', bg: 'rgba(239,68,68,0.1)', href: '/admin/licenses' },
  ]

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
          Dashboard Overview
        </h1>
        <p style={{ fontSize: 14, color: '#64748b' }}>
          Welcome back! Here's what's happening with your app.
        </p>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 32 }}>
        {stats.map(s => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Tables row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Recent users */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Recent signups</h2>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Latest registered users</p>
            </div>
            <Link href="/admin/users" style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none', fontWeight: 600, background: 'rgba(99,102,241,0.08)', padding: '5px 12px', borderRadius: 8 }}>
              View all
            </Link>
          </div>
          <div style={{ padding: '8px 0' }}>
            {recentUsers?.map((user, i) => (
              <div key={user.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 22px', borderBottom: i < recentUsers.length - 1 ? '1px solid #f8fafc' : 'none'
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: `linear-gradient(135deg, hsl(${(i * 60) + 220}, 70%, 60%), hsl(${(i * 60) + 260}, 70%, 60%))`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 13, fontWeight: 700
                }}>
                  {user.email?.[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.full_name || user.email}
                  </p>
                  <p style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.full_name ? user.email : new Date(user.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                  background: user.role === 'admin' ? 'rgba(139,92,246,0.1)' : 'rgba(148,163,184,0.1)',
                  color: user.role === 'admin' ? '#8b5cf6' : '#94a3b8'
                }}>
                  {user.role}
                </span>
              </div>
            ))}
            {!recentUsers?.length && (
              <p style={{ textAlign: 'center', padding: '24px', fontSize: 13, color: '#cbd5e1' }}>No users yet</p>
            )}
          </div>
        </div>

        {/* Recent licenses */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Recent licenses</h2>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Latest issued licenses</p>
            </div>
            <Link href="/admin/licenses" style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none', fontWeight: 600, background: 'rgba(99,102,241,0.08)', padding: '5px 12px', borderRadius: 8 }}>
              View all
            </Link>
          </div>
          <div style={{ padding: '8px 0' }}>
            {recentLicenses?.map((license, i) => (
              <div key={license.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 22px', borderBottom: i < recentLicenses.length - 1 ? '1px solid #f8fafc' : 'none'
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: license.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: license.status === 'active' ? '#22c55e' : '#ef4444', fontSize: 16
                }}>
                  {license.status === 'active' ? '✓' : '✕'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {license.profiles?.email || '—'}
                  </p>
                  <p style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                    {license.license_key?.slice(0, 16)}...
                  </p>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, textTransform: 'capitalize',
                  background: license.plan === 'lifetime' ? 'rgba(245,158,11,0.1)' : license.plan === 'yearly' ? 'rgba(99,102,241,0.1)' : 'rgba(34,197,94,0.1)',
                  color: license.plan === 'lifetime' ? '#f59e0b' : license.plan === 'yearly' ? '#6366f1' : '#22c55e'
                }}>
                  {license.plan}
                </span>
              </div>
            ))}
            {!recentLicenses?.length && (
              <p style={{ textAlign: 'center', padding: '24px', fontSize: 13, color: '#cbd5e1' }}>No licenses yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, marginTop: 20 }}>
        {[
          { href: '/admin/licenses', title: 'Issue a license', desc: 'Manually assign a license to a user', icon: '🔑', color: '#6366f1', bg: 'rgba(99,102,241,0.06)' },
          { href: '/admin/users',    title: 'Manage users',    desc: 'View, promote or manage all users',  icon: '👥', color: '#8b5cf6', bg: 'rgba(139,92,246,0.06)' },
        ].map(a => (
          <ActionCard key={a.href} {...a} />
        ))}
      </div>
    </div>
  )
}