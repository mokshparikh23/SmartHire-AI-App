import Link from 'next/link'
import { getProfile, getUser } from '@/lib/auth'
import { getEntitlement } from '@/lib/entitlement'
import Icon, { Logo } from 'smarthire-ui/Icon'
import { MARKETING_HOME } from '@/lib/site-links'
import NavItem from 'smarthire-ui/NavItem'
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
  // SETUP-TO-WEB 2026-08-30: interview setup moved off the desktop wizard and
  // onto this page. Placed second — it is the thing a user opens before every
  // interview, unlike the licence and billing pages they visit once.
  { href: '/dashboard/interviews', label: 'Interviews', icon: 'users' },
  { href: '/dashboard/license',  label: 'License',  icon: 'key' },
  { href: '/dashboard/billing',  label: 'Billing',  icon: 'card' },
  { href: '/dashboard/usage',    label: 'Usage',    icon: 'chart' },
  { href: '/dashboard/settings', label: 'Settings', icon: 'gear' },
]

/*
  LAYOUT FIX 2026-08-30: the sidebar used to grow with the page.

  It is a flex item in the layout's `flex min-h-screen` row, so with the default
  align-items: stretch its height became the height of the TALLEST sibling — the
  <main> content. On a long page (Billing, Usage) that made the sidebar thousands
  of pixels tall, which pushed the account block and sign-out far below the fold
  and meant scrolling the whole document to reach them.

  // const SHELL = 'flex w-60 shrink-0 flex-col border-r border-line bg-canvas'

  Three parts to the fix, all needed together:
    h-dvh      pins the height to the viewport instead of the content. dvh not
               vh so mobile browser chrome collapsing does not clip the bottom.
    self-start cancels align-items: stretch. An explicit height already wins over
               stretch, but this states the intent and stops a future flex tweak
               quietly reintroducing the bug.
    sticky     keeps it in place while <main> scrolls past it.

  `sticky` here relies on no ancestor having overflow hidden/auto/scroll. The
  layout's wrapper does not, and <main> is a SIBLING rather than an ancestor, so
  its overflow does not affect this.
*/
const SHELL =
  'sticky top-0 flex h-dvh w-60 shrink-0 flex-col self-start border-r border-line bg-canvas'

/*
  min-h-0 is not decorative: a flex child's min-height defaults to auto, which
  refuses to shrink below its content, so overflow-y-auto would never actually
  scroll and the list would overflow the pinned shell instead. With both, a nav
  longer than the viewport scrolls inside itself and the account block below
  stays pinned to the bottom edge.
*/
const NAV_SCROLL = 'min-h-0 flex-1 overflow-y-auto px-3 py-1'

function Brand() {
  return (
    <div className="px-5 py-5">
      {/* SPLIT 2026-09-01: cross-origin now — see app/(auth)/layout.jsx.
          <Link href="/" …> */}
      <a href={MARKETING_HOME} className="flex items-center gap-2.5">
        <Logo size={28} />
        {/* The wordmark was still the old working title. Every other shell —
            SiteNav, SiteChrome, the auth layout, AdminSidebar — says "Smart
            Hire AI", so this one followed. Non-breaking spaces because the
            column is 240px and the name should never wrap mid-brand.
        <span className="text-[14px] font-semibold tracking-tight text-ink">Interview&nbsp;AI</span> */}
        <span className="text-[14px] font-semibold tracking-tight text-ink">Smart&nbsp;Hire&nbsp;AI</span>
      </a>
    </div>
  )
}

/**
 * The signup-grant card, moved here from the Overview page on 2026-08-30.
 *
 * Sized for a 240px column, so it is stacked rather than the wide row it was on
 * Overview: icon and title, one line of state, then a full-width button. The
 * copy is the same, shortened where the narrower measure made it wrap badly.
 *
 * Rendered inside the pinned footer block rather than the scrolling nav, so it
 * sits above the account row and stays on screen at any page length.
 */
function FreePlanCard({ minutes }) {
  return (
    <div className="mx-1 mb-3 rounded-xl border border-line bg-paper p-3">
      <div className="flex items-center gap-2">
        <Icon name="gift" size={15} className="shrink-0 text-positive" />
        <h2 className="text-[13px] font-semibold text-ink">Free plan</h2>
      </div>

      <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
        {minutes > 0
          ? `${minutes} min left. Buy credits for full-length interviews.`
          : 'Free minutes used up. Buy credits to keep going.'}
      </p>

      {/*
        Not the shared <Button>: at this width its default padding leaves no room
        for the label, and the arrow pushes the text off-centre. A plain link
        styled to match is less machinery than fighting the component's sizes.
      */}
      <Link
        href="/dashboard/billing"
        className="mt-2.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-ink text-[12px] font-medium text-paper transition-colors hover:bg-ink-soft"
      >
        See plans
        <Icon name="arrowRight" size={13} />
      </Link>
    </div>
  )
}

export default async function Sidebar() {
  // getUser/getProfile/getEntitlement are all React cache()d, so asking here
  // costs nothing beyond what the page beside this already asks.
  const [profile, user] = await Promise.all([getProfile(), getUser()])

  // A signed-out render is impossible in practice — every dashboard page calls
  // requireUser() — but the sidebar streams inside its own Suspense boundary and
  // must not throw on a lapsed session mid-navigation.
  const entitlement = user ? await getEntitlement(user.id) : null
  const showFreePlan = !!entitlement?.onFreePlan && !!entitlement?.license

  const initial =
    profile?.full_name?.[0]?.toUpperCase() ||
    profile?.email?.[0]?.toUpperCase() ||
    'U'

  return (
    <aside className={SHELL}>
      <Brand />

      <nav className={NAV_SCROLL}>
        <ul className="space-y-0.5">
          {NAV.map(item => <NavItem key={item.href} {...item} />)}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        {showFreePlan && <FreePlanCard minutes={entitlement.minutes} />}

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

      <nav className={NAV_SCROLL}>
        <ul className="space-y-0.5">
          {NAV.map(item => <NavItem key={item.href} {...item} />)}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-line p-3">
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
