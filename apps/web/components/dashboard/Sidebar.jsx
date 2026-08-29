'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Icon, { Logo } from '@/components/ui/Icon'

const NAV = [
  { href: '/dashboard',          label: 'Overview', icon: 'grid' },
  { href: '/dashboard/license',  label: 'License',  icon: 'key' },
  { href: '/dashboard/billing',  label: 'Billing',  icon: 'card' },
  { href: '/dashboard/usage',    label: 'Usage',    icon: 'chart' },
  { href: '/dashboard/settings', label: 'Settings', icon: 'gear' },
]

export default function Sidebar({ profile }) {
  const pathname = usePathname()
  const router   = useRouter()

  const handleLogout = async () => {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initial =
    profile?.full_name?.[0]?.toUpperCase() ||
    profile?.email?.[0]?.toUpperCase() ||
    'U'

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-canvas">
      <div className="px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="text-[14px] font-semibold tracking-tight text-ink">Interview&nbsp;AI</span>
        </Link>
      </div>

      <nav className="flex-1 px-3">
        <ul className="space-y-0.5">
          {NAV.map(item => {
            const active = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] transition-colors ${
                    active
                      ? 'bg-paper font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                      : 'text-muted hover:bg-paper/60 hover:text-ink'
                  }`}
                >
                  <Icon name={item.icon} size={17} className={active ? 'text-ink' : 'text-faint'} />
                  {item.label}
                </Link>
              </li>
            )
          })}
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
        <button
          onClick={handleLogout}
          className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-muted transition-colors hover:bg-critical-soft hover:text-critical"
        >
          <Icon name="logout" size={16} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
