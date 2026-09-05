'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from 'smarthire-ui'

export default function RevokeLicenseButton({ licenseId }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleRevoke = async () => {
    if (!confirm('Revoke this licence? The user loses access immediately.')) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/licenses/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseId }),
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
    <Button size="sm" variant="danger" onClick={handleRevoke} disabled={loading}>
      {loading ? 'Revoking…' : 'Revoke'}
    </Button>
  )
}
