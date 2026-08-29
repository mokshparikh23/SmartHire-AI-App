import CopyButton from '@/components/dashboard/CopyButton'

const STATUS_STYLES = {
  active:  { chip: 'bg-green-100 text-green-700',   label: 'Active'  },
  revoked: { chip: 'bg-red-100 text-red-700',       label: 'Revoked' },
  expired: { chip: 'bg-gray-100 text-gray-600',     label: 'Expired' }
}

function expiryLabel({ plan, status, expires_at }) {
  if (status === 'revoked') return 'Revoked by an administrator'
  if (plan === 'lifetime')  return 'Lifetime access — never expires'
  if (!expires_at)          return 'No expiry date set'

  const date = new Date(expires_at)
  const days = Math.ceil((date - new Date()) / 86400000)
  const when = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

  if (days < 0)  return `Expired on ${when}`
  if (days === 0) return `Expires today (${when})`
  return `Expires in ${days} day${days === 1 ? '' : 's'} — ${when}`
}

export default function LicenseCard({ license }) {
  const status = STATUS_STYLES[license.status] || STATUS_STYLES.expired
  const isActive = license.status === 'active'

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-gray-900">
            {license.plan.charAt(0).toUpperCase() + license.plan.slice(1)} plan
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Issued {new Date(license.created_at).toLocaleDateString()}
          </p>
        </div>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${status.chip}`}>
          {status.label}
        </span>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
        <code className={`text-sm font-mono tracking-widest ${isActive ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
          {license.license_key}
        </code>
        {isActive && <CopyButton text={license.license_key} />}
      </div>

      <p className="text-xs text-gray-400 mt-3">{expiryLabel(license)}</p>
    </div>
  )
}
