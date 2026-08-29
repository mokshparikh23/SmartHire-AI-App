'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const STATUS_STYLE = {
  active:  { bg: 'rgba(34,197,94,0.1)',   color: '#16a34a', label: 'Active'  },
  revoked: { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444', label: 'Revoked' },
  expired: { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', label: 'Expired' },
}

const PLAN_STYLE = {
  monthly:  { bg: 'rgba(34,197,94,0.08)',   color: '#16a34a'  },
  yearly:   { bg: 'rgba(99,102,241,0.08)',  color: '#6366f1'  },
  lifetime: { bg: 'rgba(245,158,11,0.1)',   color: '#d97706'  },
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      style={{
        padding: '3px 8px', borderRadius: 6, border: 'none',
        background: copied ? 'rgba(34,197,94,0.1)' : 'rgba(99,102,241,0.08)',
        color: copied ? '#16a34a' : '#6366f1',
        fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', marginLeft: 6
      }}
    >
      {copied ? '✓' : 'Copy'}
    </button>
  )
}

export default function LicenseTable({ licenses }) {
  const router              = useRouter()
  const [loading, setLoading] = useState(null)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('all')

  const filtered = licenses?.filter(l => {
    const matchSearch = !search || 
      l.license_key?.toLowerCase().includes(search.toLowerCase()) ||
      l.profiles?.email?.toLowerCase().includes(search.toLowerCase()) ||
      l.profiles?.full_name?.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || l.status === filter || l.plan === filter
    return matchSearch && matchFilter
  })

  const handleRevoke = async (licenseId, email) => {
    if (!confirm(`Revoke license for ${email}?`)) return
    setLoading(licenseId)
    try {
      const res = await fetch('/api/admin/licenses/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseId })
      })
      if (!res.ok) throw new Error('Failed')
      router.refresh()
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div>
      {/* Search + filter bar */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid #f8fafc', display: 'flex', gap: 12, alignItems: 'center', background: '#fafafa' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by email or license key..."
            style={{
              width: '100%', paddingLeft: 36, paddingRight: 14, paddingTop: 8, paddingBottom: 8,
              border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13,
              color: '#374151', outline: 'none', background: '#fff', boxSizing: 'border-box'
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'active', 'revoked', 'lifetime', 'yearly', 'monthly'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none',
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                textTransform: 'capitalize', transition: 'all 0.15s',
                background: filter === f ? '#6366f1' : '#f1f5f9',
                color: filter === f ? '#fff' : '#64748b'
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
              {['#', 'User', 'License Key', 'Plan', 'Status', 'Created', 'Expires', 'Actions'].map(h => (
                <th key={h} style={{
                  padding: '10px 20px', textAlign: 'left',
                  fontSize: 10, fontWeight: 700, color: '#94a3b8',
                  textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap'
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered?.map((license, i) => {
              const statusStyle = STATUS_STYLE[license.status] || STATUS_STYLE.expired
              const planStyle   = PLAN_STYLE[license.plan]     || PLAN_STYLE.monthly
              const isLifetime  = license.plan === 'lifetime'

              return (
                <tr
                  key={license.id}
                  style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.1s' }}
                  onMouseOver={e => e.currentTarget.style.background = '#fafbff'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                >
                  {/* # */}
                  <td style={{ padding: '14px 20px', fontSize: 12, color: '#cbd5e1', fontWeight: 600 }}>
                    {i + 1}
                  </td>

                  {/* User */}
                  <td style={{ padding: '14px 20px', minWidth: 180 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: `linear-gradient(135deg, hsl(${i * 47 + 200}, 65%, 58%), hsl(${i * 47 + 240}, 65%, 58%))`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 12, fontWeight: 700
                      }}>
                        {license.profiles?.email?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
                          {license.profiles?.full_name || '—'}
                        </p>
                        <p style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
                          {license.profiles?.email}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* License Key */}
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <code style={{
                        fontSize: 12, fontFamily: 'monospace',
                        background: '#f8fafc', border: '1px solid #e2e8f0',
                        padding: '4px 10px', borderRadius: 6,
                        color: '#475569', letterSpacing: '0.05em', whiteSpace: 'nowrap'
                      }}>
                        {license.license_key}
                      </code>
                      <CopyBtn text={license.license_key} />
                    </div>
                  </td>

                  {/* Plan */}
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '4px 10px',
                      borderRadius: 20, textTransform: 'capitalize',
                      background: planStyle.bg, color: planStyle.color,
                      display: 'inline-flex', alignItems: 'center', gap: 4
                    }}>
                      {isLifetime && '♾️ '}
                      {license.plan}
                    </span>
                  </td>

                  {/* Status */}
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '4px 10px',
                      borderRadius: 20, background: statusStyle.bg, color: statusStyle.color,
                      display: 'inline-flex', alignItems: 'center', gap: 5
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusStyle.color, display: 'inline-block' }} />
                      {statusStyle.label}
                    </span>
                  </td>

                  {/* Created */}
                  <td style={{ padding: '14px 20px', whiteSpace: 'nowrap' }}>
                    <p style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>
                      {new Date(license.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </td>

                  {/* Expires */}
                  <td style={{ padding: '14px 20px', whiteSpace: 'nowrap' }}>
                    {isLifetime ? (
                      <span style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>Never ♾️</span>
                    ) : license.expires_at ? (
                      <p style={{ fontSize: 12, color: new Date(license.expires_at) < new Date() ? '#ef4444' : '#475569', fontWeight: 500 }}>
                        {new Date(license.expires_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    ) : (
                      <span style={{ fontSize: 12, color: '#cbd5e1' }}>—</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '14px 20px' }}>
                    {license.status === 'active' ? (
                      <button
                        onClick={() => handleRevoke(license.id, license.profiles?.email)}
                        disabled={loading === license.id}
                        style={{
                          padding: '6px 14px', borderRadius: 8,
                          border: '1px solid #fecaca', background: '#fef2f2',
                          color: '#ef4444', fontSize: 12, fontWeight: 600,
                          cursor: loading === license.id ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s', whiteSpace: 'nowrap',
                          opacity: loading === license.id ? 0.6 : 1
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = '#fee2e2' }}
                        onMouseOut={e => { e.currentTarget.style.background = '#fef2f2' }}
                      >
                        {loading === license.id ? 'Revoking...' : 'Revoke'}
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: '#cbd5e1', fontStyle: 'italic' }}>
                        {license.status}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}

            {!filtered?.length && (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#cbd5e1', fontSize: 14 }}>
                  {search ? `No licenses matching "${search}"` : 'No licenses yet. Issue one above.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer count */}
      {filtered && filtered.length > 0 && (
        <div style={{ padding: '12px 24px', borderTop: '1px solid #f8fafc', background: '#fafafa' }}>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>
            Showing {filtered.length} of {licenses?.length || 0} licenses
          </p>
        </div>
      )}
    </div>
  )
}