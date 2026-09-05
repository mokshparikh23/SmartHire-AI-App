'use client'

import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Icon from 'smarthire-ui/Icon'

/**
 * ADMIN SPLIT 2026-09-01 ─ a copy of
 * apps/web/components/dashboard/SignOutButton.jsx, and it is NOT a duplication
 * oversight.
 *
 * THE IMPORT ON LINE 5 IS THE ENTIRE REASON. This must resolve to
 * apps/admin/lib/supabase.js — the client carrying
 * `cookieOptions: { name: 'shai-admin-auth' }`. Point it at apps/web's and
 * signOut() clears the wrong cookie: in development, where the two apps share a
 * jar because cookies ignore ports, pressing Sign out here would end the
 * DASHBOARD session and leave the admin session live. Silently, and in the
 * direction that matters.
 *
 * That is why the two files are not shared and why a shared one would have to
 * take an injected client — more coupling than a 25-line component earns. If you
 * are editing one of these, check the other.
 *
 * The rest is carried over unchanged, including the two things that were fixed
 * on the apps/web copy: replace() rather than push()+refresh() (which is two
 * full RSC fetches, since refresh() invalidates what push() just fetched, and it
 * also keeps the signed-out page out of the back history), and the prefetch,
 * because nothing else on this origin links to /login so there is otherwise no
 * prefetch entry and the navigation pays a cold round trip.
 */
export default function SignOutButton({ className = '' }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  useEffect(() => { router.prefetch('/login') }, [router])

  const handleLogout = () => {
    startTransition(async () => {
      await createClient().auth.signOut()
      router.replace('/login')
    })
  }

  return (
    <button
      onClick={handleLogout}
      disabled={pending}
      className={`mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-muted transition-colors duration-150 hover:bg-critical-soft hover:text-critical disabled:pointer-events-none disabled:opacity-60 ${className}`}
    >
      <Icon name="logout" size={16} />
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
