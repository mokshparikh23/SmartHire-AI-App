import CopyButton from '@/components/dashboard/CopyButton'
import { Card, Badge } from '@/components/ui'

const STATUS = {
  active:  { tone: 'positive', label: 'Active' },
  revoked: { tone: 'critical', label: 'Revoked' },
  expired: { tone: 'neutral',  label: 'Expired' },
}

function expiryLabel({ plan, status, expires_at }) {
  if (status === 'revoked') return 'Revoked by an administrator'
  if (plan === 'lifetime')  return 'Lifetime access — never expires'
  if (!expires_at)          return 'No expiry date set'

  const date = new Date(expires_at)
  const days = Math.ceil((date - new Date()) / 86400000)
  const when = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

  if (days < 0)   return `Expired on ${when}`
  if (days === 0) return `Expires today, ${when}`
  return `Expires in ${days} day${days === 1 ? '' : 's'} — ${when}`
}

export default function LicenseCard({ license }) {
  const status = STATUS[license.status] || STATUS.expired
  const isActive = license.status === 'active'

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold capitalize text-ink">{license.plan} plan</h2>
          <p className="mt-0.5 text-[12px] text-faint">
            Issued {new Date(license.created_at).toLocaleDateString()}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-line bg-canvas px-4 py-3">
        <code
          className={`font-mono text-[13px] tracking-wider ${isActive ? 'text-ink' : 'text-faint line-through'}`}
          data-numeric
        >
          {license.license_key}
        </code>
        {isActive && <CopyButton text={license.license_key} />}
      </div>

      <p className="mt-3 text-[13px] text-muted">{expiryLabel(license)}</p>
    </Card>
  )
}
