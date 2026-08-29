'use client'

import Link from 'next/link'
import { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import Icon from '@/components/ui/Icon'

/**
 * One sidebar link.
 *
 * The bug this fixes: the old markup derived `active` from `usePathname()`
 * alone, and usePathname does not change until the RSC payload for the new route
 * has landed. So the item you clicked stayed grey for the whole wait — the app
 * looked frozen even when it was working.
 *
 * `useLinkStatus` (next/link, not next/navigation) reports the pending state of
 * the enclosing <Link>. It must be read from a component INSIDE that Link.
 *
 * Worth knowing: the docs are explicit that "if the linked route has been
 * prefetched, the pending state will be skipped". All five sidebar links are
 * permanently in the viewport, so in production they are almost always
 * prefetched and `pending` never goes true. What actually makes the highlight
 * instant is the loading.jsx files — navigation then commits on the same frame
 * and usePathname flips immediately. This hook is the cold-prefetch fallback,
 * not the main mechanism.
 */
function ItemBody({ icon, label, active }) {
  const { pending } = useLinkStatus()
  const lit = active || pending

  return (
    <>
      <Icon name={icon} size={17} className={lit ? 'text-ink' : 'text-faint'} />
      {label}
      {/* Fixed-size and always rendered, so toggling it cannot shift the row.
          The docs call this out: inline indicators easily introduce layout shift. */}
      <span
        aria-hidden
        className={`ml-auto h-1.5 w-1.5 rounded-full bg-faint transition-opacity duration-150 ${
          pending ? 'opacity-100 motion-safe:animate-pulse' : 'opacity-0'
        }`}
      />
    </>
  )
}

export default function NavItem({ href, label, icon }) {
  const pathname = usePathname()
  const active = pathname === href

  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] transition-colors duration-150 ${
          active
            ? 'bg-paper font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
            : 'text-muted hover:bg-paper/60 hover:text-ink'
        }`}
      >
        <ItemBody icon={icon} label={label} active={active} />
      </Link>
    </li>
  )
}
