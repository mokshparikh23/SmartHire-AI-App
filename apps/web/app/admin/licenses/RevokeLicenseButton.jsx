'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RevokeLicenseButton({ licenseId }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleRevoke = async () => {
    if (!confirm('Revoke this license? The user will lose access immediately.')) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/licenses/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseId })
      })
      if (!res.ok) throw new Error('Failed to revoke')
      router.refresh()
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleRevoke}
      disabled={loading}
      className="text-xs font-medium text-red-600 hover:text-red-800 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
    >
      {loading ? 'Revoking...' : 'Revoke'}
    </button>
  )
}