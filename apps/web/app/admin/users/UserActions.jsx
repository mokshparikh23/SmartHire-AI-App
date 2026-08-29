'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function UserActions({ user, activeLicense }) {
  const router              = useRouter()
  const [loading, setLoading] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showIssue, setShowIssue] = useState(false)
  const [plan, setPlan]       = useState('monthly')

  const doAction = async (url, body, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return
    setLoading(true)
    setShowMenu(false)
    try {
      const res  = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.refresh()
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  const issueLicense = async () => {
    await doAction('/api/admin/licenses/issue', { userId: user.id, plan })
    setShowIssue(false)
  }

  return (
    <>
      {/* Issue License Modal */}
      {showIssue && (
        <div
          onClick={() => setShowIssue(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 20, padding: 28,
              width: 340, boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
              Issue License
            </h3>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>{user.email}</p>

            <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Select Plan
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 24 }}>
              {['monthly', 'yearly', 'lifetime'].map(p => (
                <button
                  key={p}
                  onClick={() => setPlan(p)}
                  style={{
                    padding: '10px 6px', borderRadius: 10, border: 'none',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    textTransform: 'capitalize', transition: 'all 0.15s',
                    background: plan === p ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : '#f8fafc',
                    color: plan === p ? '#fff' : '#64748b',
                    boxShadow: plan === p ? '0 4px 12px rgba(99,102,241,0.3)' : 'none'
                  }}
                >
                  {p}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowIssue(false)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #e2e8f0',
                  background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={issueLicense}
                disabled={loading}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  boxShadow: '0 4px 12px rgba(99,102,241,0.3)'
                }}
              >
                {loading ? 'Issuing...' : 'Issue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Issue license button */}
        <button
          onClick={() => setShowIssue(true)}
          style={{
            padding: '6px 14px', borderRadius: 8, border: 'none',
            background: 'rgba(99,102,241,0.1)', color: '#6366f1',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.15s', whiteSpace: 'nowrap'
          }}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(99,102,241,0.2)'}
          onMouseOut={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
        >
          + License
        </button>

        {/* Revoke button — only if active license */}
        {activeLicense && (
          <button
            onClick={() => doAction(
              '/api/admin/licenses/revoke',
              { licenseId: activeLicense.id },
              `Revoke license for ${user.email}?`
            )}
            disabled={loading}
            style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid #fecaca',
              background: '#fef2f2', color: '#ef4444',
              fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s', whiteSpace: 'nowrap', opacity: loading ? 0.6 : 1
            }}
            onMouseOver={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.borderColor = '#fca5a5' }}
            onMouseOut={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fecaca' }}
          >
            {loading ? '...' : 'Revoke'}
          </button>
        )}

        {/* Make admin / remove admin */}
        <button
          onClick={() => doAction(
            '/api/admin/users/role',
            { userId: user.id, role: user.role === 'admin' ? 'user' : 'admin' },
            `${user.role === 'admin' ? 'Remove admin from' : 'Make admin'}: ${user.email}?`
          )}
          disabled={loading}
          style={{
            padding: '6px 14px', borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: '#f8fafc', color: '#64748b',
            fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s', whiteSpace: 'nowrap', opacity: loading ? 0.6 : 1
          }}
          onMouseOver={e => { e.currentTarget.style.background = '#f1f5f9' }}
          onMouseOut={e => { e.currentTarget.style.background = '#f8fafc' }}
        >
          {user.role === 'admin' ? 'Remove admin' : 'Make admin'}
        </button>
      </div>
    </>
  )
}