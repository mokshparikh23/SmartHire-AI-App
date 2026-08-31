'use client'

// import { useState } from 'react'
// PREMIUM-LIST 2026-09-01: useRef + useEffect join it — see catchUp() below.
import { useEffect, useRef, useState } from 'react'

/*
  RESUME-UPLOAD 2026-08-30

  One company mark, three call sites: the combobox dropdown rows, the selected
  state inside the field, and the interview list rows.

  A plain <img>, not next/image. Brandfetch's terms require their CDN to serve
  the logo, so it must be hotlinked rather than optimised and re-served — and
  next/image would additionally mean an images.remotePatterns entry in
  next.config.mjs plus an optimiser round trip for a 24-pixel image.
*/
export default function CompanyLogo({ src, name, size = 24, className = '' }) {
  /* PREMIUM-LIST 2026-09-01: WHICH src failed, not merely THAT one did.

     A plain boolean could not be cleared when the prop changed: once `failed`
     was true the <img> stopped rendering, so nothing was left to fire onError
     or to inspect, and re-typing a company in the combobox — from a domain
     Brandfetch does not have to one it does — kept the initial-letter
     placeholder for the rest of the session. Comparing against the src the
     failure belongs to makes a new src start clean by construction, with no
     reset effect to keep in step. */
  // const [failed, setFailed] = useState(false)
  const [failedSrc, setFailedSrc] = useState(null)
  const failed = Boolean(src) && failedSrc === src

  /*
    PREMIUM-LIST 2026-09-01 ─ THE onError THAT NEVER FIRED.

    On the interviews list this component is server-rendered: the <img> is in the
    HTML the browser receives, so it starts fetching the logo the moment the
    parser reaches it — long before React has hydrated and attached the onError
    handler below. A domain Brandfetch does not have therefore 404s during
    parsing, the error event is dispatched with nobody listening, and the row
    keeps the browser's broken-image glyph forever. The handler only works for
    images that appear AFTER hydration, which is why the combobox — where every
    row is created by a keystroke — never showed the bug and this list always
    did. (The `fallback/404` path fixed in lib/company.js on 2026-09-01 is what
    makes the 404 happen at all; before that the CDN answered 200 with a blank,
    so this was hidden behind a different failure.)

    `complete` with a zero naturalWidth is the DOM's own record of "this one is
    finished and there is no image", which is exactly the event that was missed.
    Keyed on src so a changed company re-checks rather than staying failed.
  */
  const imgRef = useRef(null)
  useEffect(() => {
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth === 0) setFailedSrc(src)
  }, [src])

  /* Third-party logo CDNs 404 constantly, and a broken-image glyph in a dropdown
     reads as a bug in our app rather than a gap in their index. The initial is
     the same shape and size, so nothing reflows when one fails. */
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'

  /* Radius is derived from size rather than accepted through className, so a
     caller cannot stack `rounded-lg` onto `rounded-md` — the shorthand collision
     the `inverse` button variant exists to warn about. */
  const radius = size >= 32 ? 'rounded-lg' : 'rounded-md'

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        /* PREMIUM-LIST 2026-09-01: the letter scales with the tile. This is
           rendered at 24px in the combobox rows and at 44px in the interviews
           list, and one fixed 11px served the first and made the second look
           broken — a small grey letter marooned in the middle of a large empty
           square, next to real logos that fill theirs.

           An INLINE STYLE and not a `text-[…]` class, for the same reason the
           radius above is derived rather than accepted: two font-size utilities
           on one element collide, and Tailwind v4 picks the winner by
           stylesheet order rather than by the order they were written. An
           inline style is unlayered, so it beats both without a fight.

           0.42 of the tile, floored at 11px so the 24px call site keeps exactly
           the size it has today. */
        // style={{ width: size, height: size }}
        style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.42)) }}
        // className={`… ${radius} bg-canvas-2 text-[11px] font-semibold text-muted …`}
        className={`inline-flex shrink-0 items-center justify-center ${radius} bg-canvas-2 font-semibold text-muted ${className}`}
      >
        {initial}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      // Empty on purpose: the company name is always adjacent as real text, so
      // announcing it twice is noise.
      alt=""
      width={size}
      height={size}
      loading="lazy"
      ref={imgRef}
      // onError={() => setFailed(true)}
      onError={() => setFailedSrc(src)}
      style={{ width: size, height: size }}
      className={`shrink-0 ${radius} border border-line-soft bg-paper object-contain ${className}`}
    />
  )
}
