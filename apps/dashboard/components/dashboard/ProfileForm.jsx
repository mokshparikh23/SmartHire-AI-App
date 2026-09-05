'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Icon from '@smarthire/ui/Icon'
import { Button } from '@smarthire/ui'

const FIELD =
  'w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-[14px] text-ink ' +
  'placeholder:text-faint outline-none transition-colors focus:border-ink/40'

export default function ProfileForm({ profile }) {
  const router = useRouter()
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  const unchanged = fullName.trim() === (profile?.full_name || '')

  const handleSubmit = async e => {
    e.preventDefault()
    setError(''); setSuccess(''); setLoading(true)
    try {
      // full_name is the only column a signed-in user may write — the database
      // revokes update on the rest, role included.
      const { error } = await createClient()
        .from('profiles')
        .update({ full_name: fullName.trim() })
        .eq('id', profile.id)

      if (error) throw new Error(error.message)
      setSuccess('Saved')
      router.refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="full_name" className="mb-1.5 block text-[13px] font-medium text-ink-soft">
          Full name
        </label>
        <input
          id="full_name" type="text" value={fullName}
          onChange={e => setFullName(e.target.value)}
          placeholder="Your name" className={FIELD}
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-ink-soft">
          Email
        </label>
        <input
          id="email" type="email" value={profile?.email || ''} disabled
          className={`${FIELD} cursor-not-allowed bg-canvas text-faint`}
        />
        <p className="mt-1.5 text-[12px] text-faint">
          Contact support to change the email on your account.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading || unchanged}>
          {loading ? 'Saving…' : 'Save changes'}
        </Button>
        {error && (
          <span className="flex items-center gap-1.5 text-[13px] text-critical">
            <Icon name="ban" size={14} />{error}
          </span>
        )}
        {success && (
          <span className="flex items-center gap-1.5 text-[13px] text-positive">
            <Icon name="check" size={14} />{success}
          </span>
        )}
      </div>
    </form>
  )
}
