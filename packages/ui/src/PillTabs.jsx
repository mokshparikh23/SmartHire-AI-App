'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * useLayoutEffect warns when it runs during server rendering, and this is a
 * client component that Next still renders on the server for the first paint.
 * Falling back to useEffect there keeps the console clean; the effect itself is
 * a DOM measurement, so there is nothing for it to do on the server anyway.
 */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Pill toggle with a measured sliding ink indicator.
 *
 * DESI-MODE 2026-08-30: lifted out of PricingPlans.jsx, where it was a private
 * `Tabs` that hard-coded its two labels and its aria-label. The Desi Mode card
 * needs three, and re-implementing a measured indicator plus a resize listener
 * plus a fonts.ready re-measure is exactly the drift that put CONTROL, TH and
 * Field into ./index.jsx.
 *
 * It lives in its own file rather than in that barrel because the barrel has no
 * 'use client' directive, and adding one there would turn Container, Button,
 * Card and Badge into client components at every call site on the site. Same
 * reasoning as Icon.jsx.
 *
 * The sliding indicator is positioned from the active tab's MEASURED offset
 * rather than a percentage, so it stays correct when the labels are different
 * widths — which they are, and which a 1/n split would get wrong.
 *
 * WHAT WAS ADDED IN THE LIFT. role="tablist" promises arrow-key navigation and
 * the original did not deliver it, so there is a roving tabindex and a key
 * handler now. `aria-controls` is emitted only when a panelId is passed:
 * PricingPlans switches two panels that are not tabpanels, and a tab pointing
 * aria-controls at nothing is worse than a tab that omits it. That keeps the
 * pricing call site behaviourally identical apart from the keyboard support.
 *
 * NO className PROP, deliberately. The root carries bg-paper and border-line,
 * and letting a caller append colours to that string is the Tailwind v4
 * same-property collision documented above BUTTON_VARIANTS in
 * components/ui/index.jsx. Style the wrapper instead.
 */
export default function PillTabs({
  items, value, onChange, label, idBase, panelId, compact = false,
}) {
  const wrapRef = useRef(null)
  const [glide, setGlide] = useState({ left: 0, width: 0 })

  const measure = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const active = wrap.querySelector('[data-active="true"]')
    if (!active) return
    setGlide({ left: active.offsetLeft, width: active.offsetWidth })
  }, [])

  // Layout effect so the indicator is in place on the first paint rather than
  // sliding in from zero on mount.
  useIsoLayoutEffect(measure, [measure, value])

  useEffect(() => {
    window.addEventListener('resize', measure)
    // Webfonts land after hydration and change the label widths under the
    // indicator, so re-measure once they are ready.
    document.fonts?.ready.then(measure).catch(() => {})
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  // Automatic activation: the panels here are a text swap, so selecting on arrow
  // rather than on Enter is both the APG default and the cheaper one.
  const onKeyDown = (e) => {
    const keys = items.map(([k]) => k)
    const at   = keys.indexOf(value)
    const last = keys.length - 1

    let next
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = keys[at === last ? 0 : at + 1]
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = keys[at === 0 ? last : at - 1]
    else if (e.key === 'Home') next = keys[0]
    else if (e.key === 'End') next = keys[last]
    else return

    // Also stops Home/End scrolling the page out from under the card.
    e.preventDefault()
    onChange(next)
    wrapRef.current?.querySelector(`[data-key="${next}"]`)?.focus()
  }

  return (
    <div
      ref={wrapRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="relative inline-flex shrink-0 gap-0.5 rounded-full border border-line bg-paper p-1.5"
    >
      <span
        aria-hidden="true"
        className="absolute bottom-1.5 top-1.5 rounded-full bg-ink transition-all duration-[450ms] ease-[cubic-bezier(0.22,0.9,0.28,1)]"
        style={{ left: glide.left, width: glide.width }}
      />
      {items.map(([key, text]) => {
        const active = value === key
        return (
          <button
            key={key}
            id={idBase ? `${idBase}-tab-${key}` : undefined}
            role="tab"
            type="button"
            data-key={key}
            // Kept verbatim from the original: the indicator's measure() finds
            // the active button by querySelector('[data-active="true"]').
            data-active={active}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            {...(panelId ? { 'aria-controls': panelId } : null)}
            onClick={() => onChange(key)}
            className={[
              'relative z-10 whitespace-nowrap rounded-full py-2.5 text-[14px] font-medium',
              'transition-colors duration-300',
              // `compact` exists so that lifting this does not silently reflow
              // the pricing toggle: two labels at px-7 already fit a 375px
              // screen, three do not.
              compact ? 'px-4 sm:px-7' : 'px-7',
              active ? 'text-paper' : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            {text}
          </button>
        )
      })}
    </div>
  )
}
