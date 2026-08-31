'use client'

import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Icon from 'smarthire-ui/Icon'

/*
  PIVOT 2026-08-29: shared by the dashboard and admin sidebars, which each had a
  byte-identical copy of this handler. The original:

  // const handleLogout = async () => {
  //   await createClient().auth.signOut()
  //   router.push('/login')
  //   router.refresh()
  // }

  Three problems with it:
   1. No pending state at all. The button sat inert for the whole signOut round
      trip, then for the navigation after it.
   2. push() followed by refresh() is two full RSC fetches — refresh()
      invalidates the router cache and refetches what push() just fetched.
      replace() alone is correct here, and it also keeps the signed-out page out
      of the back-button history.
   3. Nothing links to /login, so it is never prefetched and the navigation
      always paid a cold round trip.
*/
export default function SignOutButton({ className = '' }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Warm /login so the redirect after sign-out is instant. Nothing else in the
  // dashboard links to it, so without this there is no prefetch entry.
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
