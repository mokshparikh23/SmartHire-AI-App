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

  if (href) return <Link href={href} className={cls} {...rest}>{body}</Link>
  const Tag = as
  return <Tag className={cls} {...rest}>{body}</Tag>
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
