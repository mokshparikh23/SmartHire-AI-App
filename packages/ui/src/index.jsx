import Link from 'next/link'
import Icon from './Icon'

/** Page width. One value everywhere so edges line up across sections. */
export function Container({ children, className = '', wide = false }) {
  return (
    <div className={`mx-auto w-full px-6 ${wide ? 'max-w-6xl' : 'max-w-5xl'} ${className}`}>
      {children}
    </div>
  )
}

const BUTTON_VARIANTS = {
  // Primary is ink, not a gradient. This is the single biggest reason the page
  // reads as considered rather than templated.
  primary: 'bg-ink text-paper hover:bg-ink-soft',
  /*
    PREMIUM-LIST 2026-09-01: the hover tint goes one step darker, canvas →
    canvas-2.

    Not a taste change. `bg-canvas` is exactly the colour an interview row takes
    when the pointer is over it, so the Edit button inside that row hovered to
    the same value as its own background — the button's fill vanished under the
    pointer and the only thing that answered was the border. A hover state that
    disappears at the moment it fires is worse than none. canvas-2 is the tint
    used for pressed/selected surfaces elsewhere and reads on both grounds.

    secondary: 'bg-paper text-ink border border-line hover:border-ink/30 hover:bg-canvas',
  */
  secondary: 'bg-paper text-ink border border-line hover:border-ink/30 hover:bg-canvas-2',
  ghost: 'text-ink-soft hover:text-ink hover:bg-canvas-2',
  danger: 'bg-critical-soft text-critical border border-critical/20 hover:bg-critical hover:text-paper',
  /*
    REDESIGN 2026-08-30: primary inverted, for the ink panels (landing close-out,
    dashboard setup card). It has to be a VARIANT, not a className override.

    Callers used to write `<Button className="bg-paper text-ink …">` on top of
    the primary variant, which put `text-paper` and `text-ink` on the same
    element. Tailwind v4 resolves that collision by stylesheet order, not by the
    order of the class attribute, and it emits utilities sorted by value name —
    so `.text-paper` lands after `.text-ink` and wins. `.bg-paper` beat `.bg-ink`
    for the same reason, which is why the button rendered as a white pill with
    white, invisible text rather than losing both overrides visibly.
  */
  inverse: 'bg-paper text-ink hover:bg-canvas-2',
  /*
    AUTH 2026-08-30: the "it worked" state of a submit button, held for the beat
    between a successful request and the navigation it triggers.

    A VARIANT, not a `className="bg-positive"` override on primary, for exactly
    the reason spelled out under `inverse`: that would put bg-ink and bg-positive
    on the same element and let stylesheet order pick the winner.

    No hover change — by the time this shows, the button is disabled and the
    page is already leaving; a hover response would invite a second click.
  */
  positive: 'bg-positive text-paper',
  /*
    PREMIUM-LIST 2026-09-01: a destructive action that is not the point of the
    row it sits in — the bin at the end of an interview in the list.

    `ghost` is too present for it. Ghost is ink-soft, the same weight as the
    Edit button beside it, so the two read as a pair of equals and the darker,
    heavier one is the one that destroys something. This starts at faint, where
    a bin belongs when you are scanning a list, and only finds its colour under
    the pointer — at which point the red says plainly what the click does.

    A VARIANT, not `variant="ghost" className="text-faint hover:text-critical"`,
    for the reason spelled out under `inverse`: that puts two `color` utilities
    on one element and Tailwind v4 picks the winner by stylesheet order rather
    than by the order of the class attribute.
  */
  quiet: 'text-faint hover:bg-critical-soft hover:text-critical',
}

/*
  PREMIUM-LIST 2026-09-01: `xs` added — 32px, for a control that lives INSIDE a
  row of a list rather than under a heading of its own.

  `sm` was the floor until now, and it is a page-level size: 36px tall with 14px
  of side padding, which is what a "Replace" or a "Download" button wants when it
  is the only thing on its line. Dropped into an interview row it competes with
  the row — the Edit pill ended up taller than the interview's own name is tall,
  so the eye landed on a button that does the same thing as clicking the row.

  const BUTTON_SIZES = {
    sm: 'h-9 px-3.5 text-[13px]',
    …

  ROW-CHIP-PARITY 2026-09-01: xs drops again, 32px → 24px, to the height of a
  Badge. Both numbers are below, so this is one decision recorded in two files:
  a row that ends in Resume · PDF · Edit · bin has FOUR objects on one line, and
  a button 7.5px taller than the chip beside it does not read as "the actionable
  one" — it reads as a row that failed to line up. 24px is the WCAG 2.2 target
  minimum (24×24 CSS px), which is the floor this can go to and the reason it
  stops here rather than matching the chip's old 24.5 exactly.

  xs: 'h-8 px-3 text-[12px]',
*/
const BUTTON_SIZES = {
  xs: 'h-6 px-2.5 text-[12px]',
  sm: 'h-9 px-3.5 text-[13px]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-[15px]',
}

/*
  The same four heights as SQUARES, for `iconOnly` — a button whose whole label
  is a glyph.

  A separate table rather than `BUTTON_SIZES[size] + ' w-8 px-0'`, because that
  puts `px-3` and `px-0` on one element and Tailwind v4 settles same-property
  collisions by stylesheet order, not by the order of your class attribute —
  `.px-0` is emitted before `.px-3`, so the padding you asked to remove wins and
  the button stays a lopsided pill. Same trap the `inverse` variant exists to
  avoid; see BUTTON_VARIANTS above.

  With `rounded-full` from the base classes these come out as circles, which is
  what a bin at the end of a row should be: it has no word to be wide for.
*/
const BUTTON_ICON_SIZES = {
  // ROW-CHIP-PARITY 2026-09-01: 24×24 with the rest of the row. Exactly the WCAG
  // 2.2 minimum target, and the reason nothing here goes smaller.
  // xs: 'h-8 w-8',
  xs: 'h-6 w-6',
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-12 w-12',
}

export function Button({
  as = 'button', href, variant = 'primary', size = 'md',
  // iconOnly: the children are a glyph and nothing else. Pair it with an
  // aria-label — a button with no text has no accessible name otherwise.
  icon, iconRight, iconOnly = false, className = '', children, ...rest
}) {
  /*
    PREMIUM-LIST 2026-09-01: two additions to the base line, and one property
    widened.

    `active:scale-[0.97]` — the press. Colour alone is a poor acknowledgement on
    a trackpad, where the pointer does not move and the hover state is already
    showing before the click; a 3% dip is the cheapest way for the button to
    answer the finger. It is small on purpose: at 0.95 a 32px control visibly
    jumps, and the row it sits in appears to move with it.

    `transition` rather than `transition-colors`, because the scale above is a
    transform and `transition-colors` does not carry transforms — the press
    would snap in and ease out, which reads as a glitch rather than as a press.
    Reduced-motion readers get all of it flattened by the global rule in
    packages/ui/src/styles/base.css.

    `select-none` — these are pressed, not read. Without it a double click on
    Edit leaves the word highlighted in the row.

    The pointer cursor is NOT here. It is a base-layer rule in base.css, because
    v4's preflight dropped it for every button in the app rather than just for
    this component; the note there has the detail.

    'inline-flex items-center justify-center gap-2 rounded-full font-medium',
    'transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none',
  */
  const cls = [
    'inline-flex select-none items-center justify-center gap-2 rounded-full font-medium',
    'transition duration-150 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none',
    BUTTON_VARIANTS[variant],
    iconOnly ? BUTTON_ICON_SIZES[size] : BUTTON_SIZES[size],
    className,
  ].join(' ')

  const body = (
    <>
      {icon && <Icon name={icon} size={16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={16} />}
    </>
  )

  /*
    PIVOT 2026-08-29: this used to branch on `href` alone —

    // if (href) return <Link href={href} className={cls} {...rest}>{body}</Link>

    — which silently ignored `as` whenever an href was present. `<Button as="a"
    href="#">` therefore rendered a next/link, not an anchor, and a `disabled`
    prop on it did nothing at all because Link has no disabled state.

    Now `as` wins when it is set explicitly, and an external or protocol URL
    (mailto:, tel:, http://…) also takes the plain-anchor path: next/link is for
    in-app routes, and routing a mailto: through it is unverified behaviour.
  */
  const external = typeof href === 'string' && /^(https?:|mailto:|tel:|#)/.test(href)

  if (href && as === 'button' && !external) {
    return <Link href={href} className={cls} {...rest}>{body}</Link>
  }

  const Tag = href ? (as === 'button' ? 'a' : as) : as
  return <Tag className={cls} {...(href ? { href } : null)} {...rest}>{body}</Tag>
}

/*
  CARD-TONE 2026-09-01: `tone` exists because `<Card className="border-critical/20">`
  DOES NOTHING, and had been doing nothing at seven call sites.

  Measured, not guessed: the computed border-color of that card is rgb(231,229,228)
  — --color-line — not the red tint the class asks for. `border-line` is baked into
  the base line below, so the element carries two border-color utilities, and
  Tailwind v4 settles that by stylesheet order rather than by the order of the
  class attribute. `.border-line` sorts after `.border-critical/20` and wins. This
  is the same trap BUTTON_VARIANTS and TONES are each written out at length to
  avoid; Card was simply the one that had no escape hatch, so callers reached for
  className and got silence.

  It was invisible at six of those seven sites because each also sets a
  `bg-*-soft` tint and the border is not carrying the signal. The seventh is the
  Delete account card, where the border IS the only signal — a destructive card
  that looked exactly like the Profile card above it.

  So the base line stops hard-coding a border colour and the tone supplies one.
  `neutral` reproduces today's appearance byte for byte, which is why no existing
  call site has to change.

  // <Tag className={`rounded-2xl border border-line bg-paper ${padded ? 'p-6' : ''} ${className}`}>
*/
const CARD_TONES = {
  neutral:  'border-line',
  critical: 'border-critical/20',
  warning:  'border-warning/30',
  positive: 'border-positive/20',
}

export function Card({ children, className = '', as = 'div', padded = true, tone = 'neutral' }) {
  const Tag = as
  return (
    <Tag className={`rounded-2xl border ${CARD_TONES[tone] ?? CARD_TONES.neutral} bg-paper ${padded ? 'p-6' : ''} ${className}`}>
      {children}
    </Tag>
  )
}

const TONES = {
  neutral:  'bg-canvas-2 text-ink-soft',
  accent:   'bg-accent-soft text-accent',
  positive: 'bg-positive-soft text-positive',
  critical: 'bg-critical-soft text-critical',
  warning:  'bg-warning-soft text-warning',
  /*
    DESI-MODE 2026-08-30: the solid flag, for a "New" pill sitting next to a
    headline. Every tone above is a soft tint with matching text and none of them
    can out-shout a 21px title; `accent` is spoken for by the hero badge and by
    the highlight chips inside the Desi Mode card, and `warning` is the reference
    design's amber, which is not this palette. Ink rather than a sixth hue
    because the note at the top of globals.css is explicit that emphasis here is
    ink and the accent is reserved for links and small marks.

    It has to be a TONE. `<Badge className="bg-ink text-paper">` would put
    bg-canvas-2 against bg-ink and text-ink-soft against text-paper on the same
    element, and Tailwind v4 resolves same-property collisions by stylesheet
    order, not by the order of your class attribute — so the winner is whichever
    utility name sorts later, not the one you wrote last. Same trap the `inverse`
    button variant exists to avoid; see BUTTON_VARIANTS above.
  */
  ink:      'bg-ink text-paper',
}

/*
  ROW-CHIP-PARITY 2026-09-01: an EXPLICIT height, and a little less of everything
  else.

  The chip had no height at all — `py-1` on 11px text, which the browser resolved
  to 24.5px through the normal line box. A fractional height is why these never
  sat crisply against anything: half a pixel of the pill lands on a device-pixel
  boundary and the top and bottom edges antialias differently. h-6 pins it at 24
  and hands the same number to Button's `xs`, which is what makes Resume, PDF,
  Edit and the bin one row of equals rather than four sizes.

  px-2.5 → px-2 and gap-1.5 → gap-1 are the "slightly big" half of the same note:
  the height was close to right, the WIDTH was what made a two-word chip look
  like a control. 4px comes off each chip, 5 off the ones carrying an icon.

  Global, not a size prop on Badge. There is one chip in this design system and
  it is worth keeping that true — the admin tables and the usage page get the
  same 1px trim, which nothing there is measured against.

  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium …`}>
*/
/*
  ONE-RESUME-CHIP 2026-09-01: a chip can be a control now — `as="button"` plus
  `interactive`, with everything else about it unchanged.

  The interviews list needed a "Resume" chip that opens the stored PDF. The
  alternative was to hand-write the pill in that component, and the geometry
  above is exactly what must not be copied: h-6 is the number Button's `xs` was
  matched to, so a second copy of it drifts the moment either is touched.

  `interactive` rather than letting the caller pass hover classes. A hover on the
  same property as the tone is safe in a way a base override is not — `:hover`
  adds a pseudo-class, so `.hover\:bg-line:hover` outranks `.bg-canvas-2` on
  specificity rather than on stylesheet order — but that reasoning belongs in
  this file once, not in every caller that wants a clickable chip. The states are
  tuned for `neutral`, which is the only tone anything clickable uses today.

  `type` is NOT defaulted here. A <button> inside a form defaults to submit, and
  a chip that quietly submits the form around it is a real bug — so callers pass
  `type="button"` themselves, where a reader can see it.

  export function Badge({ tone = 'neutral', children, className = '' }) {
    return (
      <span className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium …`}>
*/
export function Badge({
  tone = 'neutral', as = 'span', interactive = false,
  children, className = '', ...rest
}) {
  const Tag = as
  const cls = [
    'inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium',
    TONES[tone],
    interactive
      ? 'transition duration-150 hover:bg-line hover:text-ink active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none'
      : '',
    className,
  ].join(' ')

  return <Tag className={cls} {...rest}>{children}</Tag>
}

/** Eyebrow + serif heading + optional lede, used to open every section. */
export function SectionHeading({ eyebrow, title, lede, align = 'left', className = '' }) {
  return (
    <div className={`${align === 'center' ? 'text-center mx-auto max-w-2xl' : 'max-w-2xl'} ${className}`}>
      {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
      <h2 className="display text-[2rem] sm:text-[2.5rem] text-ink">{title}</h2>
      {lede && <p className="mt-4 text-[15px] leading-relaxed text-muted">{lede}</p>}
    </div>
  )
}

/** Label / value pair used across the dashboard and admin metric rows. */
export function Stat({ label, value, sub, icon, tone = 'neutral' }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <span className="eyebrow">{label}</span>
        {icon && (
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONES[tone]}`}>
            <Icon name={icon} size={16} />
          </span>
        )}
      </div>
      <div>
        <p className="display text-[2rem] text-ink" data-numeric>{value}</p>
        {sub && <p className="mt-1 text-[13px] text-muted">{sub}</p>}
      </div>
    </Card>
  )
}

/** Consistent empty state instead of a bare "no rows" line. */
export function EmptyState({ icon = 'inbox', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-canvas-2 text-faint">
        <Icon name={icon} size={22} />
      </span>
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

/**
 * Form control. Was inlined in IssueLicenseForm; several forms need it now, and
 * a credit amount typed into a box that looks different from every other box is
 * how a wrong number gets entered.
 */
/* RESUME-UPLOAD 2026-08-30: split so a caller can supply its own horizontal
   padding. The company combobox insets a logo on the left and needs pl-10.
   Stacking `pl-10` onto CONTROL would NOT reliably win — `px-3.5` and `pl-10`
   are shorthand and longhand of the same property, and Tailwind v4 resolves that
   collision by stylesheet order, not by the order of your class attribute. That
   is the same trap the `inverse` button variant exists to avoid; see
   BUTTON_VARIANTS above. Every existing caller is untouched. */
export const CONTROL_PADLESS =
  'h-11 w-full rounded-xl border border-line bg-paper text-[14px] text-ink ' +
  'outline-none transition-colors focus:border-ink/40'

// export const CONTROL =
//   'h-11 w-full rounded-xl border border-line bg-paper px-3.5 text-[14px] text-ink ' +
//   'outline-none transition-colors focus:border-ink/40'
export const CONTROL = `${CONTROL_PADLESS} px-3.5`

/** Table header cell. Was copied verbatim into four files, now six. */
export const TH =
  'px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint'

/**
 * Labelled form field. Was local to InterviewProfiles; the resume editor and the
 * company combobox need it too, which is the same "copied verbatim into four
 * files" trigger that put CONTROL and TH here.
 *
 * WHY htmlFor SWITCHES THE WRAPPER. Wrapping the control in a <label> is right
 * for a single input — the whole row becomes a click target. It is wrong for
 * anything with its own click targets inside: a combobox's listbox lives in the
 * field, and a click on an option inside a <label> is forwarded to the labelled
 * input, so selecting a suggestion silently does nothing. Passing htmlFor
 * switches to the explicit association and a plain <div> wrapper.
 */
export function Field({ label, hint, required, htmlFor, children }) {
  const Wrap = htmlFor ? 'div' : 'label'
  const Label = htmlFor ? 'label' : 'span'
  return (
    <Wrap className="block">
      <Label
        {...(htmlFor ? { htmlFor } : {})}
        className="mb-2 block text-[13px] font-medium text-ink"
      >
        {label}{required && <span className="text-critical"> *</span>}
      </Label>
      {children}
      {hint && <span className="mt-2 block text-[12px] text-muted">{hint}</span>}
    </Wrap>
  )
}

/** Page title block for dashboard and admin screens. */
/* BACK-ARROW 2026-09-01: `onBack` added.

   Here rather than hand-rolled at the call site, so every back arrow in the
   dashboard is one glyph at one size in one position — the thing a design
   system is for. Passing it does NOT make this a client component and must not:
   the root export deliberately has no 'use client' (see package.json), so a
   handler can only come from a caller that is already one. Same rule `action`
   and Button's onClick have always lived under.

   In flow, not absolutely positioned into the left gutter. The gutter is
   px-8 — 32px — and this needs 48, so an absolute arrow would hang outside a
   `main` that scrolls, and buy a horizontal scrollbar on any window narrow
   enough to hit the padding. The cost is that the title sits 48px right when
   the arrow is there, which is a shift between two different screens rather
   than a jump within one. */
export function PageHeader({ title, lede, action, onBack, backLabel = 'Back' }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      {/* items-start, and h-9 against a 2rem/1.14 title: the button is 36px and
          the title's line box is 36.5, so the arrow centres on the title and
          stays there when the lede below it wraps to two lines. */}
      <div className="flex items-start gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-canvas-2 hover:text-ink"
          >
            <Icon name="arrowLeft" size={20} />
          </button>
        )}
        <div>
          <h1 className="display text-[2rem] text-ink">{title}</h1>
          {lede && <p className="mt-1.5 text-[14px] text-muted">{lede}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}
