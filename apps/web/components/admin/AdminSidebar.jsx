import Link from 'next/link'
import Icon, { Logo } from 'smarthire-ui/Icon'
import NavItem from '@/components/dashboard/NavItem'
import SignOutButton from '@/components/dashboard/SignOutButton'

/*
  PIVOT 2026-08-29: the nav-item markup and the sign-out handler were duplicated
  verbatim from components/dashboard/Sidebar.jsx and are now shared. The shell is
  NOT shared: this sidebar has its own NAV, a two-line wordmark with an "Admin"
  sub-label, a "Back to my dashboard" block, and different avatar fallbacks
  ('A'/'Admin' rather than 'U'/'User'). Merging the two would have deleted those.

  'use client' is gone with the handler — NavItem and SignOutButton carry their
  own boundaries, so nothing left here needs one.

  The old inline handler, for reference:

  // const handleLogout = async () => {
  //   await createClient().auth.signOut()
  //   router.push('/login')
  //   router.refresh()
  // }
*/

const NAV = [
  { href: '/admin',          label: 'Overview', icon: 'grid' },
  { href: '/admin/users',    label: 'Users',    icon: 'users' },
  { href: '/admin/licenses', label: 'Licenses', icon: 'key' },
  { href: '/admin/usage',    label: 'Usage',    icon: 'chart' },
]

export default function AdminSidebar({ profile }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-canvas">
      <div className="px-5 py-5">
        <Link href="/admin" className="flex items-center gap-2.5">
          <Logo size={28} />
          <span>
            <span className="block text-[14px] font-semibold leading-tight tracking-tight text-ink">Smart&nbsp;Hire&nbsp;AI</span>
            <span className="block text-[11px] leading-tight text-faint">Admin</span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3">
        <ul className="space-y-0.5">
          {NAV.map(item => <NavItem key={item.href} {...item} />)}
        </ul>

        <div className="mt-6 border-t border-line pt-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-muted transition-colors duration-150 hover:bg-paper/60 hover:text-ink"
          >
            <Icon name="arrowRight" size={16} className="text-faint" />
            Back to my dashboard
          </Link>
        </div>
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-medium text-paper">
            {profile?.full_name?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || 'A'}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ink">{profile?.full_name || 'Admin'}</p>
            <p className="truncate text-[11px] text-faint">{profile?.email}</p>
          </div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  )
}
