import Link from 'next/link'
import { getProfile } from '@/lib/auth'
import { Logo } from '@/components/ui/Icon'
import NavItem from './NavItem'
import SignOutButton from './SignOutButton'

/*
  PIVOT 2026-08-29: was a single 'use client' component taking `profile` as a
  prop from an async layout. Now it is a Server Component that fetches its own
  profile inside the layout's <Suspense>, so the dashboard shell paints before
  this resolves instead of after. The two genuinely interactive pieces moved to
  NavItem.jsx and SignOutButton.jsx.

  getProfile() is React cache()d, so the page rendering alongside this pays
  nothing for asking the same question.
*/

const NAV = [
  { href: '/dashboard',          label: 'Overview', icon: 'grid' },
  { href: '/dashboard/license',  label: 'License',  icon: 'key' },
  { href: '/dashboard/billing',  label: 'Billing',  icon: 'card' },
  { href: '/dashboard/usage',    label: 'Usage',    icon: 'chart' },
  { href: '/dashboard/settings', label: 'Settings', icon: 'gear' },
]

const SHELL = 'flex w-60 shrink-0 flex-col border-r border-line bg-canvas'

function Brand() {
  return (
    <div className="px-5 py-5">
      <Link href="/" className="flex items-center gap-2.5">
        <Logo size={28} />
        <span className="text-[14px] font-semibold tracking-tight text-ink">Interview&nbsp;AI</span>
      </Link>
    </div>
  )
}

export default async function Sidebar() {
  const profile = await getProfile()

  const initial =
    profile?.full_name?.[0]?.toUpperCase() ||
    profile?.email?.[0]?.toUpperCase() ||
    'U'

  return (
    <aside className={SHELL}>
      <Brand />

      <nav className="flex-1 px-3">
        <ul className="space-y-0.5">
          {NAV.map(item => <NavItem key={item.href} {...item} />)}
        </ul>
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-medium text-paper">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ink">{profile?.full_name || 'User'}</p>
            <p className="truncate text-[11px] text-faint">{profile?.email}</p>
          </div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  )
}

/**
 * Fallback for the layout's Suspense boundary.
 *
 * Renders the nav links as real, immediately-clickable <NavItem>s — they need no
 * data — and greys only the account block, which does. That means the sidebar
 * never appears to pop in, and navigation works before the profile has loaded.
 */
export function SidebarSkeleton() {
  return (
    <aside className={SHELL}>
      <Brand />

      <nav className="flex-1 px-3">
        <ul className="space-y-0.5">
          {NAV.map(item => <NavItem key={item.href} {...item} />)}
        </ul>
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-canvas-2" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <span className="block h-[13px] w-24 animate-pulse rounded bg-canvas-2" />
            <span className="block h-[11px] w-32 animate-pulse rounded bg-canvas-2" />
          </div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  )
}
