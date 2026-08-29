'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function IssueLicenseForm({ users }) {
  const router = useRouter()
  const [form, setForm]     = useState({ userId: '', plan: 'monthly' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async e => {
    e.preventDefault()
    setError(''); setSuccess('')
    setLoading(true)
    try {
      const res = await fetch('/api/admin/licenses/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess(`License issued: ${data.license_key}`)
      setForm({ userId: '', plan: 'monthly' })
      router.refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
      {/* User select */}
      <div className="flex-1 min-w-48">
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">User</label>
        <select
          required
          value={form.userId}
          onChange={e => setForm(f => ({ ...f, userId: e.target.value }))}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none focus:border-indigo-500 bg-white"
        >
          <option value="">Select a user...</option>
          {users?.map(u => (
            <option key={u.id} value={u.id}>
              {u.full_name ? `${u.full_name} (${u.email})` : u.email}
            </option>
          ))}
        </select>
      </div>

      {/* Plan select */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Plan</label>
        <select
          value={form.plan}
          onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none focus:border-indigo-500 bg-white"
        >
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
          <option value="lifetime">Lifetime</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all disabled:opacity-50"
      >
        {loading ? 'Issuing...' : '+ Issue License'}
      </button>

      {error   && <p className="w-full text-xs text-red-600 mt-1">{error}</p>}
      {success && <p className="w-full text-xs text-green-600 mt-1 font-mono">{success}</p>}
    </form>
  )
}