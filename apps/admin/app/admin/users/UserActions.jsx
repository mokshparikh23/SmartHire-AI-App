'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from 'smarthire-ui/Icon'
import { Button, Badge, CONTROL } from 'smarthire-ui'
import { formatBalance, MINUTES_PER_CREDIT } from 'smarthire-data/credits'

/** Shortcuts, not the vocabulary. Discounts and manual fulfilment mean any
 *  integer has to stay reachable, so the minutes field is never limited to these. */
const QUICK_CREDITS = [1, 2, 5, 10]

const SUBSCRIPTIONS = ['weekly', 'monthly', 'yearly']

export default function UserActions({ user, activeLicense, wallet, viewerId, adminCount }) {
  const router = useRouter()
  const [loading, setLoading]   = useState(false)
  const [modal, setModal]       = useState(null)      // 'credits' | 'plan' | null
  const [error, setError]       = useState('')

  const balance = wallet?.minutes_balance ?? 0

  /*
    ADMIN SPLIT 2026-09-01 ─ THIS IS AFFORDANCE, NOT THE GUARD. Read that twice
    before trusting it: everything below is a `disabled` attribute, and a
    disabled attribute stops an accident, not an attacker. The real guard is
    profile_set_role() plus the profiles_keep_one_admin triggers in
    20260901035900_admin_split_audit.sql, which hold against this UI, the API
    route, a psql session and the Supabase dashboard alike. Do not move either
    rule up here and delete it down there.

    What it prevents in practice. This table lists every profile INCLUDING your
    own, so "Remove admin" was rendered on your own row, one confirm() away from
    a service-role update that bypasses RLS. A sole admin pressing it left the
    system with no admin and no way back inside the product.

    Both values arrive free from page.jsx: requireAdminPage() already returns the
    viewer's profile, and the page already has the full list to count.
  */
  const isSelf     = user.id === viewerId
  const isLastAdmin = user.role === 'admin' && adminCount <= 1
  const roleLocked = user.role === 'admin' && (isSelf || isLastAdmin)
  const roleReason = isSelf
    ? 'You cannot remove your own admin access. Ask another admin to do it.'
    : 'This is the only admin account. Promote someone else first.'

  const doAction = async (url, body, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return null
    setLoading(true)
    setError('')
    try {
      const res  = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.refresh()
      return data
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {modal === 'credits' && (
        <Modal onClose={() => setModal(null)} title="Grant credits" subtitle={user.email}>
          <p className="mt-0.5 text-[13px] text-muted" data-numeric>
            Balance now: {formatBalance(balance)}
          </p>
          <GrantCredits
            balance={balance}
            loading={loading}
            error={error}
            onSubmit={async ({ minutes, note }) => {
              const done = await doAction('/api/admin/credits/grant', { userId: user.id, minutes, note })
              if (done) setModal(null)
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {modal === 'plan' && (
        <Modal onClose={() => setModal(null)} title="Subscription" subtitle={user.email}>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            A subscription is <strong className="text-ink">unlimited</strong> interview time until
            it ends — sessions are not metered at all. Credits are left untouched underneath and
            start being spent again the moment it lapses.
          </p>

          <p className="eyebrow mb-2.5 mt-6">Comp a period</p>
          <div className="grid grid-cols-3 gap-2">
            {SUBSCRIPTIONS.map(kind => (
              <button
                key={kind}
                disabled={loading}
                onClick={async () => {
                  const done = await doAction('/api/admin/subscription', { userId: user.id, kind })
                  if (done) setModal(null)
                }}
                className="rounded-lg border border-line bg-paper px-2 py-2.5 text-[13px] font-medium capitalize text-muted transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-40"
              >
                {kind}
              </button>
            ))}
          </div>

          {wallet?.subscription_kind && (
            <Button
              variant="danger"
              className="mt-5 w-full"
              disabled={loading}
              onClick={async () => {
                const done = await doAction(
                  '/api/admin/subscription',
                  { userId: user.id, kind: null },
                  `Remove the ${wallet.subscription_kind} subscription for ${user.email}? Their credits are not affected.`,
                )
                if (done) setModal(null)
              }}
            >
              Remove subscription
            </Button>
          )}

          {error && (
            <p className="mt-3 flex items-center gap-2 text-[13px] text-critical">
              <Icon name="ban" size={14} />{error}
            </p>
          )}

          <Button variant="secondary" className="mt-3 w-full" onClick={() => setModal(null)}>
            Close
          </Button>
        </Modal>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Granting credits is now by far the most common action, so it leads. */}
        <Button size="sm" variant="secondary" icon="coin" onClick={() => setModal('credits')}>
          Credits
        </Button>

        <Button size="sm" variant="ghost" onClick={() => setModal('plan')}>
          {wallet?.subscription_kind ? 'Subscription' : 'Comp plan'}
        </Button>

        {!activeLicense && (
          <Button
            size="sm" variant="secondary" icon="plus" disabled={loading}
            onClick={() => doAction('/api/admin/licenses/issue', { userId: user.id, credits: 0 })}
          >
            Licence
          </Button>
        )}

        {activeLicense && (
          <Button
            size="sm" variant="danger" disabled={loading}
            onClick={() => doAction(
              '/api/admin/licenses/revoke',
              { licenseId: activeLicense.id },
              `Revoke the licence for ${user.email}? They lose access immediately. Their balance is not affected.`,
            )}
          >
            Revoke
          </Button>
        )}

        {/* title, not a tooltip component: a disabled button is the one control
            that cannot explain itself on click, so the reason has to be on hover
            — and it is the same sentence profile_set_role() returns, so the
            person who reaches the 409 another way reads the same words. */}
        <Button
          size="sm" variant="ghost" disabled={loading || roleLocked}
          title={roleLocked ? roleReason : undefined}
          onClick={() => doAction(
            '/api/admin/users/role',
            { userId: user.id, role: user.role === 'admin' ? 'user' : 'admin' },
            `${user.role === 'admin' ? 'Remove admin from' : 'Make admin'}: ${user.email}?`,
          )}
        >
          {user.role === 'admin' ? 'Remove admin' : 'Make admin'}
        </Button>
      </div>
    </>
  )
}

function Modal({ title, subtitle, children, onClose }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-line bg-paper p-6 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.25)]"
      >
        <h3 className="display text-[1.5rem] text-ink">{title}</h3>
        <p className="mt-1 truncate text-[13px] text-muted">{subtitle}</p>
        {children}
      </div>
    </div>
  )
}

/**
 * Credits and minutes are bound to each other, and minutes is what gets sent.
 *
 * That pairing is the guard against the classic "I typed 5 and meant 5 hours"
 * error: whichever box you type in, the other one shows you what you actually
 * asked for before you commit it.
 */
function GrantCredits({ balance, loading, error, onSubmit, onCancel }) {
  const [minutes, setMinutes] = useState('60')
  const [credits, setCredits] = useState('1')
  const [note, setNote]       = useState('')
  const [deduct, setDeduct]   = useState(false)

  const fromCredits = value => {
    setCredits(value)
    setMinutes(String(Math.max(0, Math.round(Number(value || 0) * MINUTES_PER_CREDIT))))
  }
  const fromMinutes = value => {
    setMinutes(value)
    setCredits(String(Math.round((Number(value || 0) / MINUTES_PER_CREDIT) * 100) / 100))
  }

  const amount = Math.trunc(Number(minutes))
  const valid = Number.isFinite(amount) && amount > 0
  const signed = deduct ? -amount : amount

  return (
    <div className="mt-6">
      <p className="eyebrow mb-2.5">Amount</p>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_CREDITS.map(c => (
          <button
            key={c} type="button" onClick={() => fromCredits(String(c))}
            className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
              Number(credits) === c
                ? 'bg-ink text-paper'
                : 'border border-line bg-paper text-muted hover:border-ink/30 hover:text-ink'
            }`}
          >
            {c} credit{c === 1 ? '' : 's'}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <div className="flex-1">
          <label className="mb-1.5 block text-[13px] font-medium text-ink-soft">Credits</label>
          <input
            type="number" min="0" step="0.5" inputMode="decimal"
            value={credits} onChange={e => fromCredits(e.target.value)}
            className={CONTROL} data-numeric
          />
        </div>
        <span className="pb-3.5 text-[13px] text-faint">=</span>
        <div className="flex-1">
          <label className="mb-1.5 block text-[13px] font-medium text-ink-soft">Minutes</label>
          <input
            type="number" min="1" step="1" inputMode="numeric"
            value={minutes} onChange={e => fromMinutes(e.target.value)}
            className={CONTROL} data-numeric
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="mb-1.5 block text-[13px] font-medium text-ink-soft">Note</label>
        <input
          type="text" value={note} onChange={e => setNote(e.target.value)}
          placeholder="Launch discount, refund, goodwill…"
          className={CONTROL}
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setDeduct(v => !v)}
          className="flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink"
        >
          <Icon name={deduct ? 'minus' : 'plus'} size={14} />
          {deduct ? 'Deducting' : 'Adding'}
        </button>

        {/* The before/after line is what makes a negative adjustment safe to
            press. A clawback larger than the balance is clamped at zero by the
            database, and the route reports what it actually applied. */}
        {valid && (
          <p className="text-[13px] text-muted" data-numeric>
            {formatBalance(balance)} → {formatBalance(Math.max(0, balance + signed))}
          </p>
        )}
      </div>

      {error && (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-critical">
          <Icon name="ban" size={14} />{error}
        </p>
      )}

      <div className="mt-6 flex gap-2.5">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button
          className="flex-1"
          variant={deduct ? 'danger' : 'primary'}
          disabled={!valid || loading}
          onClick={() => onSubmit({ minutes: signed, note: note.trim() || null })}
        >
          {loading ? 'Saving…' : deduct ? `Remove ${formatBalance(amount)}` : `Add ${formatBalance(amount)}`}
        </Button>
      </div>
    </div>
  )
}
