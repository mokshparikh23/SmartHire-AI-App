'use client'

import { useState } from 'react'

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
  const [failed, setFailed] = useState(false)

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
        style={{ width: size, height: size }}
        className={`inline-flex shrink-0 items-center justify-center ${radius} bg-canvas-2 text-[11px] font-semibold text-muted ${className}`}
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
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={`shrink-0 ${radius} border border-line-soft bg-paper object-contain ${className}`}
    />
  )
}
