import { createAdminClient } from '@/lib/supabase-server'
import IssueLicenseForm from './IssueLicenseForm'
import LicenseTable from './LicenseTable'

export const metadata = { title: 'Licenses — Admin' }

export default async function LicensesPage() {
  const supabase = createAdminClient()

  const { data: licenses } = await supabase
    .from('licenses')
    .select('*, profiles(email, full_name)')
    .order('created_at', { ascending: false })

  const { data: users } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .order('email')

  const active   = licenses?.filter(l => l.status === 'active').length   || 0
  const revoked  = licenses?.filter(l => l.status === 'revoked').length  || 0
  const expired  = licenses?.filter(l => l.status === 'expired').length  || 0
  const lifetime = licenses?.filter(l => l.plan === 'lifetime').length   || 0

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Licenses</h1>
        <p style={{ fontSize: 14, color: '#64748b' }}>Issue, manage and revoke user licenses</p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total',    value: licenses?.length || 0, color: '#6366f1', bg: 'rgba(99,102,241,0.08)'  },
          { label: 'Active',   value: active,   color: '#22c55e', bg: 'rgba(34,197,94,0.08)'   },
          { label: 'Lifetime', value: lifetime, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)'  },
          { label: 'Revoked',  value: revoked + expired, color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
        ].map(s => (
          <div key={s.label} style={{
            background: '#fff', borderRadius: 14, padding: '16px 20px',
            border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            <p style={{ fontSize: 24, fontWeight: 800, color: s.color, marginBottom: 4 }}>{s.value}</p>
            <p style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>{s.label} licenses</p>
          </div>
        ))}
      </div>

      {/* Issue new license */}
      <div style={{
        background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: '22px 24px', marginBottom: 24
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔑</div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Issue new license</h2>
            <p style={{ fontSize: 12, color: '#94a3b8' }}>Manually assign a license key to a user</p>
          </div>
        </div>
        <IssueLicenseForm users={users} />
      </div>

      {/* License table */}
      <div style={{
        background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden'
      }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>All licenses</h2>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{licenses?.length || 0} total records</p>
          </div>
        </div>
        <LicenseTable licenses={licenses} />
      </div>
    </div>
  )
}