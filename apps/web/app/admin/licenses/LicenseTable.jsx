'use client'

import { useMemo, useState } from 'react'
import RevokeLicenseButton from './RevokeLicenseButton'
import CopyButton from '@/components/dashboard/CopyButton'
import { Badge, EmptyState, TH } from 'smarthire-ui'
import { formatBalance } from '@/lib/credits'

const STATUS_TONE = { active: 'positive', revoked: 'critical' }
const FILTERS     = ['all', 'active', 'revoked']

export default function LicenseTable({ licenses }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery]   = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (licenses || []).filter(l => {
      if (filter !== 'all' && l.status !== filter) return false
      if (!q) return true
      return (
        l.license_key?.toLowerCase().includes(q) ||
        l.profiles?.email?.toLowerCase().includes(q) ||
        l.profiles?.full_name?.toLowerCase().includes(q)
      )
    })
  }, [licenses, filter, query])

  const counts = useMemo(() => ({
    all:     licenses?.length || 0,
    active:  licenses?.filter(l => l.status === 'active').length || 0,
    revoked: licenses?.filter(l => l.status === 'revoked').length || 0,
    expired: licenses?.filter(l => l.status === 'expired').length || 0,
  }), [licenses])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium capitalize transition-colors ${
                filter === f
                  ? 'bg-ink text-paper'
                  : 'text-muted hover:bg-canvas-2 hover:text-ink'
              }`}
            >
              {f}
              <span className={`ml-1.5 ${filter === f ? 'text-paper/50' : 'text-faint'}`} data-numeric>
                {counts[f]}
              </span>
            </button>
          ))}
        </div>

        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search key or email"
          aria-label="Search licences"
          className="h-9 w-56 rounded-lg border border-line bg-paper px-3 text-[13px] text-ink placeholder:text-faint outline-none transition-colors focus:border-ink/40"
        />
      </div>

      {!rows.length ? (
        <EmptyState
          icon="key"
          title={query || filter !== 'all' ? 'Nothing matches' : 'No licences yet'}
          description={
            query || filter !== 'all'
              ? 'Try a different search or filter.'
              : 'Issue one with the form above.'
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead>
              <tr className="border-b border-line">
                <th className={TH}>Key</th>
                <th className={TH}>User</th>
                <th className={TH}>Balance</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map(l => (
                <tr key={l.id} className="transition-colors hover:bg-canvas">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-[12.5px] text-ink" data-numeric>{l.license_key}</code>
                      <CopyButton text={l.license_key} label="" />
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <p className="truncate font-medium text-ink">{l.profiles?.full_name || '—'}</p>
                    <p className="truncate text-[12px] text-faint">{l.profiles?.email}</p>
                  </td>
                  {/* The owner's balance, not the key's — a licence has no
                      entitlement of its own. This is the single most useful
                      thing to see while deciding whether someone needs a top-up. */}
                  <td className="px-6 py-3.5">
                    {l.profiles?.credit_wallets?.subscription_kind
                      ? <Badge tone="accent">Unlimited</Badge>
                      : <span className="text-[13px] text-ink" data-numeric>
                          {formatBalance(l.profiles?.credit_wallets?.minutes_balance)}
                        </span>}
                  </td>
                  <td className="px-6 py-3.5">
                    <Badge tone={STATUS_TONE[l.status] || 'neutral'}>{l.status}</Badge>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    {l.status === 'active' && <RevokeLicenseButton licenseId={l.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
