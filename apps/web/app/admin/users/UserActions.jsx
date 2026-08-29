'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'

const PLANS = ['monthly', 'yearly', 'lifetime']

export default function UserActions({ user, activeLicense }) {
  const router = useRouter()
  const [loading, setLoading]     = useState(false)
  const [showIssue, setShowIssue] = useState(false)
  const [plan, setPlan]           = useState('monthly')

  const doAction = async (url, body, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return
    setLoading(true)
    try {
      const res  = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  return (
    <>
      {showIssue && (
        <div
          onClick={() => setShowIssue(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
        >
          <div
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl border border-line bg-paper p-6 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.25)]"
          >
            <h3 className="display text-[1.5rem] text-ink">Issue a licence</h3>
            <p className="mt-1 truncate text-[13px] text-muted">{user.email}</p>

            <p className="eyebrow mb-2.5 mt-6">Plan</p>
            <div className="grid grid-cols-3 gap-2">
              {PLANS.map(p => (
                <button
                  key={p}
                  onClick={() => setPlan(p)}
                  className={`rounded-lg px-2 py-2.5 text-[13px] font-medium capitalize transition-colors ${
                    plan === p
                      ? 'bg-ink text-paper'
                      : 'border border-line bg-paper text-muted hover:border-ink/30 hover:text-ink'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="mt-7 flex gap-2.5">
              <Button variant="secondary" className="flex-1" onClick={() => setShowIssue(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={loading}
                onClick={async () => {
                  await doAction('/api/admin/licenses/issue', { userId: user.id, plan })
                  setShowIssue(false)
                }}
              >
                {loading ? 'Issuing…' : 'Issue'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="secondary" icon="plus" onClick={() => setShowIssue(true)}>
          Licence
        </Button>

        {activeLicense && (
          <Button
            size="sm" variant="danger" disabled={loading}
            onClick={() => doAction(
              '/api/admin/licenses/revoke',
              { licenseId: activeLicense.id },
              `Revoke the licence for ${user.email}? They lose access immediately.`,
            )}
          >
            Revoke
          </Button>
        )}

        <Button
          size="sm" variant="ghost" disabled={loading}
          onClick={() => doAction(
            '/api/admin/users/role',
            { userId: user.id, role: user.role === 'admin' ? 'user' : 'admin' },
            `${user.role === 'admin' ? 'Remove admin from' : 'Make admin'}: ${user.email}?`,
          )}
        >
          {user.role === 'admin' ? 'Remove admin' : 'Make admin'}
        </Button>
      </div>
    </>
  )
}
