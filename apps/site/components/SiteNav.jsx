'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from 'smarthire-ui/Icon'
import { Container, Button } from 'smarthire-ui'
import { LOGIN, SIGNUP } from '@/lib/app-links'

/*
  COMPARE 2026-08-30: the hrefs were bare fragments, which only worked because
  this header had exactly one page under it. From /compare, `#how` resolves to
  /compare#how — an anchor that does not exist there, so the link silently does
  nothing. Rooting them at `/` fixes that in both directions: on the landing page
  the browser still treats `/#how` as a same-document navigation and smooth
  scrolls, and from anywhere else it navigates home and lands on the section.

  const LINKS = [
    ['How it works', '#how'],
    ['Features', '#features'],
    ['Pricing', '#pricing'],
  ]
*/
/*
  DESI-MODE 2026-08-30: a fifth link, added rather than swapped for Features.

  The worry was the row wrapping into itself at md, where the bar is 768px and
  nav has no shrink-0 — so it was measured in a browser at 768/820/1024 rather
  than estimated: five links come to 419px of nav inside a 768px bar, one row,
  no page overflow. There is room for a sixth before this needs revisiting.

  ['How it works', '/#how'], ['Features', '/#features'], ['Compare', '/compare'], ['Pricing', '/#pricing'],
*/
/*
  SPLIT 2026-09-01: the fragments became routes.

  THE MEASUREMENT ABOVE STILL HOLDS AND DID NOT NEED REDOING. The rendered width
  of this row is a function of the label strings, and all five labels are
  unchanged — same words, same order. Only the hrefs moved. There is still room
  for a sixth.

  Desi Mode keeps its slot while pointing into /features rather than owning a
  route. It is a headline feature and the header should say so; it is not a
  page's worth of argument on its own.

  const LINKS = [
    ['How it works', '/#how'], ['Features', '/#features'],
    ['Desi Mode', '/#desi'], ['Compare', '/compare'], ['Pricing', '/#pricing'],
  ]
*/
const LINKS = [
  ['How it works', '/how-it-works'],
  ['Features',     '/features'],
  ['Desi Mode',    '/features#desi'],
  ['Compare',      '/compare'],
  ['Pricing',      '/pricing'],
]

/** Inside this band the bar always shows — there is no screen to reclaim yet. */
const TOP_ZONE = 72

/**
 * Minimum travel before the bar reacts. Trackpad inertia and iOS rubber-banding
 * both emit streams of 1–3px deltas; without a floor the header flickers.
 */
const THRESHOLD = 8

/**
 * Marketing header that gets out of the way on the way down and comes straight
 * back on the way up.
 *
 * A client component because it is the only part of the chrome that reacts to
 * scroll — SiteFooter stays a server component next door.
 */
export function SiteNav() {
  const [hidden, setHidden] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const headerRef = useRef(null)
  const pathname = usePathname()

  useEffect(() => {
    // The point the current gesture is measured against. It only advances once
    // a move clears THRESHOLD, so a slow drag accumulates into a real decision
    // instead of being written off as jitter frame after frame.
    let anchorY = window.scrollY
    let frame = 0

    const measure = () => {
      frame = 0
      const y = Math.max(0, window.scrollY)
      setScrolled(y > 8)

      /*
        SPLIT 2026-09-01: never hide on a page that barely scrolls.

        TOP_ZONE and THRESHOLD are absolute pixels, so nothing BREAKS on a short
        route — but hiding the header to reclaim screen only pays on a long one,
        and on a page a viewport-and-a-bit tall it is pure flicker risk for no
        reclaimed space. /pricing and /how-it-works are both in that range.
      */
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      if (scrollable < window.innerHeight * 0.6) {
        setHidden(false)
        anchorY = y
        return
      }

      if (y <= TOP_ZONE) {
        setHidden(false)
        anchorY = y
        return
      }

      const delta = y - anchorY
      if (Math.abs(delta) < THRESHOLD) return

      // Sliding the bar out from under a focused link strands keyboard users on
      // a control they can no longer see.
      const holdsFocus = headerRef.current?.contains(document.activeElement)
      setHidden(delta > 0 && !holdsFocus)
      anchorY = y
    }

    const onScroll = () => { frame ||= requestAnimationFrame(measure) }

    // Restores the right state on a reload that lands mid-page.
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  /*
    SPLIT 2026-09-01: reset on navigation, and close the menu with it.

    The chrome lives in app/layout.js now rather than being rendered by each
    page, which is what stops the scroll listener being thrown away and rebuilt
    on every route change. The cost of that is this: the component no longer
    remounts, so a header that was hidden mid-scroll when you clicked a link
    would still be hidden on the page you arrive at.
  */
  useEffect(() => {
    setHidden(false)
    setMenuOpen(false)
  }, [pathname])

  /*
    A fragment link is never "active".

    `/features` and `/features#desi` would both match a startsWith test, lighting
    two links at once on /features. Pathname equality plus this guard means
    Features lights and Desi Mode does not — which is right, because the reader
    is on Features and Desi Mode is a place within it.
  */
  const isActive = (href) => !href.includes('#') && pathname === href

  return (
    <header
      ref={headerRef}
      className={[
        'sticky top-0 z-50 border-b bg-paper/85 backdrop-blur-md',
        // Only transform and the lift animate. Animating the blur or the
        // background costs a repaint on every frame of the slide.
        'transition-[transform,box-shadow,border-color] duration-[350ms]',
        'ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform',
        hidden ? '-translate-y-full' : 'translate-y-0',
        scrolled
          ? 'border-line shadow-[0_1px_2px_rgba(22,22,26,0.04),0_10px_30px_-20px_rgba(22,22,26,0.45)]'
          : 'border-line-soft',
      ].join(' ')}
    >
      <Container wide className="flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={30} />
          <span className="text-[15px] font-semibold tracking-tight text-ink">Smart Hire AI</span>
        </Link>

        {/*
          SPLIT 2026-09-01: <a> became next/link, and the links gained a state.

          They were bare anchors because they were fragments. Four of the five
          are real routes now and should prefetch and client-navigate; next/link
          handles `/features#desi` correctly, navigating and then scrolling.

          The underline rather than a pill: the design language here is
          hairlines, and a filled chip would be the only one on the site.
        */}
        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              className={[
                'relative text-[14px] transition-colors',
                isActive(href) ? 'text-ink' : 'text-muted hover:text-ink',
                isActive(href)
                  ? 'after:absolute after:-bottom-1.5 after:left-0 after:h-px after:w-full after:bg-ink'
                  : '',
              ].join(' ')}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/*
            SPLIT 2026-09-01: both of these leave for the app on app.<domain>.
            Button already routes an https? href down the plain-anchor path
            rather than through next/link — see the PIVOT note above `external`
            in packages/ui/src/index.jsx — so this is a one-token change and
            nothing has to know it is cross-origin.
            href="/login" / href="/signup"
          */}
          <Button href={LOGIN} variant="ghost" size="sm">Log in</Button>
          <Button href={SIGNUP} size="sm">Get started</Button>

          {/*
            SPLIT 2026-09-01: a mobile menu, which this header has never had.

            `hidden md:flex` on the nav above was survivable while the site was
            one page — a phone visitor had all of it by scrolling. With five
            routes it means four of them are unreachable from the header on a
            phone, and the footer becomes the only way around. That is the worst
            regression the split introduces, so it is fixed in the same change.

            A button and a panel rather than <details>, because the panel has to
            close on navigation and <details> would stay open behind the new
            page. Everything it toggles is inside this header, which is already
            a client component, so it costs no new boundary.
          */}
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className={
              'relative flex h-9 w-9 items-center justify-center rounded-lg text-ink ' +
              'transition-colors hover:bg-canvas-2 focus-visible:bg-canvas-2 md:hidden'
            }
          >
            {/* Two hairlines that cross into an X. Drawn rather than iconned:
                Icon has no burger, and the crossfade is the whole affordance. */}
            <span
              aria-hidden="true"
              className={`absolute h-px w-4 bg-ink transition-transform duration-200 ${
                menuOpen ? 'rotate-45' : '-translate-y-[3px]'
              }`}
            />
            <span
              aria-hidden="true"
              className={`absolute h-px w-4 bg-ink transition-transform duration-200 ${
                menuOpen ? '-rotate-45' : 'translate-y-[3px]'
              }`}
            />
          </button>
        </div>
      </Container>

      {/* The panel. Rendered inside the header so it slides with it, and hidden
          from the accessibility tree as well as from view when closed. */}
      <div
        id="site-menu"
        hidden={!menuOpen}
        className="border-t border-line-soft bg-paper md:hidden"
      >
        <Container wide className="flex flex-col py-2">
          {LINKS.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              className={`py-3 text-[15px] transition-colors ${
                isActive(href) ? 'font-medium text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {label}
            </Link>
          ))}
        </Container>
      </div>
    </header>
  )
}
