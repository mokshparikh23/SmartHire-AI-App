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
  secondary: 'bg-paper text-ink border border-line hover:border-ink/30 hover:bg-canvas',
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
}

const BUTTON_SIZES = {
  sm: 'h-9 px-3.5 text-[13px]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-[15px]',
}

export function Button({
  as = 'button', href, variant = 'primary', size = 'md',
  icon, iconRight, className = '', children, ...rest
}) {
  const cls = [
    'inline-flex items-center justify-center gap-2 rounded-full font-medium',
    'transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none',
    BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className,
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

export function Card({ children, className = '', as = 'div', padded = true }) {
  const Tag = as
  return (
    <Tag className={`rounded-2xl border border-line bg-paper ${padded ? 'p-6' : ''} ${className}`}>
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
}

export function Badge({ tone = 'neutral', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${TONES[tone]} ${className}`}>
      {children}
    </span>
  )
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
 * Labelled form field. Was local to InterviewProfiles; the résumé editor and the
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
export function PageHeader({ title, lede, action }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-[2rem] text-ink">{title}</h1>
        {lede && <p className="mt-1.5 text-[14px] text-muted">{lede}</p>}
      </div>
      {action}
    </div>
  )
}
