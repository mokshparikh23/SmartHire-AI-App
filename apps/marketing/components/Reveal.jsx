'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Scroll-reveal wrapper. Adds `.in` once the element has entered the viewport,
 * which is what the `.reveal` rules in globals.css animate against.
 *
 * The observer disconnects after the first intersection on purpose — this is an
 * entrance, not a scroll-linked effect, and re-animating a section every time it
 * scrolls back past is the single most irritating version of this pattern.
 *
 * REDESIGN 2026-08-30: ported from the reference design's IntersectionObserver
 * block. `threshold: 0.06` rather than something larger because several of these
 * sections are taller than the viewport, and a section that can never reach 25%
 * visibility would never reveal at all.
 */
export default function Reveal({ as: Tag = 'div', className = '', children, ...rest }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Anything already on screen at mount — the hero's neighbours on a tall
    // display, or any section when the page is restored mid-scroll — should not
    // wait for a scroll event that may never come.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setShown(true)
        io.disconnect()
      },
      { threshold: 0.06 },
    )

    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag ref={ref} className={`reveal ${shown ? 'in' : ''} ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

/**
 * The hairline progress bar across the top of the page.
 *
 * Fixed rather than pinned to the header, because SiteNav slides out of view on
 * the way down — a progress bar that leaves with it stops being a progress bar.
 *
 * SPLIT 2026-09-01: it hides itself on short pages.
 *
 * This was written for a single 872-line scroll, where "how far through am I"
 * was a real question. On /pricing or /how-it-works, which are a couple of
 * viewports each, a bar that jumps in 40% steps is noise pretending to be
 * information. It lives in the shared layout, so the routes that should not
 * have it opt out by being short rather than by remembering to.
 */
export function ScrollProgress() {
  const [pct, setPct] = useState(0)
  const [worthShowing, setWorthShowing] = useState(false)

  useEffect(() => {
    let frame = 0

    const measure = () => {
      frame = 0
      const doc = document.documentElement
      // Guard the divide: a page shorter than the viewport has zero scrollable
      // height, and 0/0 would put NaN into a style attribute.
      const scrollable = doc.scrollHeight - window.innerHeight

      // Half a viewport of travel is the floor. Measured on every pass rather
      // than once on mount, because images and webfonts land after hydration
      // and a page can cross the line either way as they do.
      setWorthShowing(scrollable > window.innerHeight * 0.5)
      setPct(scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 0)
    }

    const onScroll = () => { frame ||= requestAnimationFrame(measure) }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  if (!worthShowing) return null

  return (
    <div
      aria-hidden="true"
      className="fixed left-0 top-0 z-[60] h-[2px] bg-ink"
      style={{ width: `${pct}%` }}
    />
  )
}
