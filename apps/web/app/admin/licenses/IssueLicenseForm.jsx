'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import { Button } from '@/components/ui'

const CONTROL =
  'h-11 w-full rounded-xl border border-line bg-paper px-3.5 text-[14px] text-ink ' +
  'outline-none transition-colors focus:border-ink/40'

export default function IssueLicenseForm({ users }) {
  const router = useRouter()
  const [form, setForm]       = useState({ userId: '', plan: 'monthly' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async e => {
    e.preventDefault()
    setError(''); setSuccess(''); setLoading(true)
    try {
      const res  = await fetch('/api/admin/licenses/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess(data.license_key)
      setForm({ userId: '', plan: 'monthly' })
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
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="plan" className="mb-1.5 block text-[13px] font-medium text-ink-soft">Plan</label>
          <select
            id="plan" value={form.plan}
            onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
            className={`${CONTROL} w-36`}
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
            <option value="lifetime">Lifetime</option>
          </select>
        </div>

        <Button type="submit" disabled={loading} icon="plus">
          {loading ? 'Issuing…' : 'Issue licence'}
        </Button>
      </div>

      {error && (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-critical">
          <Icon name="ban" size={14} />{error}
        </p>
      )}
      {success && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-positive">
          <Icon name="check" size={14} />
          Issued
          <code className="font-mono text-ink" data-numeric>{success}</code>
        </p>
      )}
    </form>
  )
}
