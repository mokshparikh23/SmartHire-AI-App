'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Logo } from 'smarthire-ui/Icon'
import { Container, Button } from 'smarthire-ui'

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
const LINKS = [
  ['How it works', '/#how'],
  ['Features', '/#features'],
  ['Desi Mode', '/#desi'],
  ['Compare', '/compare'],
  ['Pricing', '/#pricing'],
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
  const headerRef = useRef(null)

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

        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map(([label, href]) => (
            <a key={href} href={href} className="text-[14px] text-muted transition-colors hover:text-ink">
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button href="/login" variant="ghost" size="sm">Log in</Button>
          <Button href="/signup" size="sm">Get started</Button>
        </div>
      </Container>
    </header>
  )
}
