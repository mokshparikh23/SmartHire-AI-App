import CopyButton from '@/components/dashboard/CopyButton'
import Icon from 'smarthire-ui/Icon'
import { Card, Badge } from 'smarthire-ui'

const STATUS = {
  active:  { tone: 'positive', label: 'Active' },
  revoked: { tone: 'critical', label: 'Revoked' },
}

export default function LicenseCard({ license }) {
  const status = STATUS[license.status] || STATUS.revoked
  const isActive = license.status === 'active'

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Licence key</h2>
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

      {/*
        A key no longer carries a plan or an expiry date, and this line is where
        people used to look for one. It is the whole mental model in a sentence:
        the key unlocks the app, the balance pays for the time.
      */}
      <p className="mt-3 flex items-start gap-2 text-[13px] leading-relaxed text-muted">
        <Icon name="coin" size={14} className="mt-0.5 shrink-0 text-faint" />
        {isActive
          ? 'This key unlocks the app and does not expire. Interview time is billed to your account balance, not to the key.'
          : 'Revoked by an administrator. Your credit balance is untouched — a new key restores access to it.'}
      </p>
    </Card>
  )
}
