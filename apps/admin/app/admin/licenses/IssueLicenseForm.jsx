'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from 'smarthire-ui/Icon'
import { Button, CONTROL } from 'smarthire-ui'
import { formatBalance } from 'smarthire-data/credits'

export default function IssueLicenseForm({ users }) {
  const router = useRouter()
  const [form, setForm]       = useState({ userId: '', credits: '1' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(null)

  const handleSubmit = async e => {
    e.preventDefault()
    setError(''); setSuccess(null); setLoading(true)
    try {
      const res  = await fetch('/api/admin/licenses/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: form.userId, credits: Number(form.credits || 0) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess(data)
      setForm({ userId: '', credits: '1' })
      router.refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="userId" className="mb-1.5 block text-[13px] font-medium text-ink-soft">User</label>
          <select
            id="userId" required value={form.userId}
            onChange={e => setForm(f => ({ ...f, userId: e.target.value }))}
            className={CONTROL}
          >
            <option value="">Select a user…</option>
            {users?.map(u => (
              <option key={u.id} value={u.id}>
                {u.full_name ? `${u.full_name} — ${u.email}` : u.email}
                {' · '}{u.credit_wallets?.subscription_kind
                  ? 'unlimited'
                  : formatBalance(u.credit_wallets?.minutes_balance)}
              </option>
            ))}
          </select>
        </div>

        {/*
          Issuing and funding in one action, because that is how manual
          fulfilment actually happens: someone pays, and what they need is a
          working app — not a key that cannot start a session.
        */}
        <div className="w-36">
          <label htmlFor="credits" className="mb-1.5 block text-[13px] font-medium text-ink-soft">
            Starting credits
          </label>
          <input
            id="credits" type="number" min="0" step="0.5" inputMode="decimal"
            value={form.credits}
            onChange={e => setForm(f => ({ ...f, credits: e.target.value }))}
            className={CONTROL} data-numeric
          />
        </div>

        <Button type="submit" disabled={loading} icon="plus">
          {loading ? 'Issuing…' : 'Issue licence'}
        </Button>
      </div>

      <p className="mt-2 text-[12px] text-faint" data-numeric>
        1 credit = 60 minutes. Leave at 0 to issue a key without funding it.
      </p>

      {error && (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-critical">
          <Icon name="ban" size={14} />{error}
        </p>
      )}
      {success && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-positive">
          <Icon name="check" size={14} />
          Issued
          <code className="font-mono text-ink" data-numeric>{success.license_key}</code>
          {success.minutesRemaining != null && (
            <span className="text-muted" data-numeric>
              · balance {formatBalance(success.minutesRemaining)}
            </span>
          )}
        </p>
      )}
    </form>
  )
}
