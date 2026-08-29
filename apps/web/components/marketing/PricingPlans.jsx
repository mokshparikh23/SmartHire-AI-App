'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import { Card, Badge, Button } from '@/components/ui'

/**
 * The two things Smart Hire AI sells, side by side.
 *
 * Both columns are radio lists rather than three separate cards each. Six cards
 * across a page is a wall; two cards with a choice inside each is one decision
 * ("do I want unlimited or do I want to pay per hour?") followed by a smaller
 * one, which is the order people actually decide in.
 *
 * Prices arrive already resolved and formatted from the server — the client
 * never picks a currency, because a client that could pick its currency could
 * pick the cheaper one.
 */
export default function PricingPlans({ tiers, packs, singlePack, signedIn }) {
  const router = useRouter()

  const [tierId, setTierId] = useState(tiers.find(t => t.featured)?.id ?? tiers[0]?.id)
  const [packId, setPackId] = useState(packs.find(p => p.featured)?.id ?? packs[0]?.id)
  const [pending, setPending] = useState(null)   // the id being bought
  const [error, setError] = useState('')

  const tier = tiers.find(t => t.id === tierId)
  const pack = packs.find(p => p.id === packId)

  const buy = async (id) => {
    if (pending) return
    setError('')

    // Checkout needs an account to hang the credits on, so an anonymous buyer
    // signs up first rather than bouncing off a Stripe page they cannot
    // complete.
    //
    // No ?next= here: signup ends on an email-confirmation screen and returns
    // through /auth/callback, so a redirect target would be dropped on the way.
    // Sending the buyer back to the pack they picked needs that callback to
    // carry it, which it does not do yet.
    if (!signedIn) {
      router.push('/signup')
      return
    }

    setPending(id)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start checkout')
      window.location.href = data.url
    } catch (e) {
      setError(e.message)
      setPending(null)
    }
  }

  return (
    <div>
      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── Subscription ─────────────────────────────────────────────── */}
        <Card className="flex flex-col ring-1 ring-ink">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="display text-[1.75rem] text-ink">Subscription</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                Stop counting. Every call covered, for as long as you need it.
              </p>
            </div>
            <Badge tone="accent" className="shrink-0">
              <Icon name="sparkle" size={11} />
              Recommended
            </Badge>
          </div>

          <div className="mt-6 space-y-2.5">
            {tiers.map(t => (
              <Option
                key={t.id}
                name="subscription"
                selected={tierId === t.id}
                onSelect={() => setTierId(t.id)}
                label={t.label}
                badge={t.badge}
                badgeTone={t.kind === 'yearly' ? 'positive' : 'warning'}
                price={t.price}
                unit={`/ ${t.per}`}
                note={t.perMonth && (
                  <span className={t.kind === 'yearly' ? 'text-positive' : undefined}>
                    {t.perMonthApprox ? '≈ ' : ''}{t.perMonth} / Month
                  </span>
                )}
              />
            ))}
          </div>

          <ul className="mt-7 flex-1 space-y-2.5">
            {['Unlimited call time', 'Unlimited mock interviews', 'Full privacy mode', 'Top models']
              .map(f => (
                <li key={f} className="flex items-start gap-2.5 text-[14px] text-ink-soft">
                  <Icon name="check" size={15} className="mt-0.5 shrink-0 text-positive" />
                  {f}
                </li>
              ))}
          </ul>

          <Button
            className="mt-7 w-full"
            onClick={() => buy(tier.id)}
            disabled={!!pending}
          >
            {pending === tier?.id
              ? 'Opening checkout…'
              : `Go Unlimited · ${tier?.label} ${tier?.price}`}
          </Button>

          <p className="mt-3 text-center text-[13px] text-muted">No lock-in. Cancel anytime.</p>
        </Card>

        {/* ── Credits ──────────────────────────────────────────────────── */}
        <Card className="flex flex-col bg-canvas">
          <h3 className="display text-[1.75rem] text-ink">Credits</h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
            Buy a pack of call credits and use them whenever.
          </p>

          <div className="mt-6 space-y-2.5">
            {packs.map(p => (
              <Option
                key={p.id}
                name="credits"
                selected={packId === p.id}
                onSelect={() => setPackId(p.id)}
                label={`${p.credits} Credits`}
                badge={p.bonus ? `+${p.bonus} free` : null}
                badgeTone="warning"
                sub={`${p.totalCredits} hours of calls`}
                price={p.price}
                note={
                  <span className={p.bonus >= 6 ? 'text-positive' : undefined}>
                    {p.perCredit} / Credit
                  </span>
                }
              />
            ))}
          </div>

          <ul className="mt-7 flex-1 space-y-2.5">
            {['Credits never expire', 'Full privacy mode', 'Top models'].map(f => (
              <li key={f} className="flex items-start gap-2.5 text-[14px] text-ink-soft">
                <Icon name="check" size={15} className="mt-0.5 shrink-0 text-positive" />
                {f}
              </li>
            ))}
            <li className="flex items-start gap-2.5 text-[14px] text-faint">
              <Icon name="close" size={15} className="mt-0.5 shrink-0" />
              Unlimited number of calls
            </li>
          </ul>

          <Button
            variant="secondary"
            className="mt-7 w-full"
            onClick={() => buy(pack.id)}
            disabled={!!pending}
          >
            {pending === pack?.id
              ? 'Opening checkout…'
              : `Get ${pack?.totalCredits} hours · ${pack?.price}`}
          </Button>

          {/* The single credit is deliberately outside the ladder: it exists so
              nobody bounces off the page for want of a small option. */}
          <p className="mt-3 text-center text-[13px] text-muted">
            or, just need 1 call?{' '}
            <button
              onClick={() => buy(singlePack.id)}
              disabled={!!pending}
              className="font-medium text-ink underline underline-offset-2 hover:text-accent disabled:opacity-40"
            >
              1 credit for <span data-numeric>{singlePack.price}</span>
            </button>
          </p>
        </Card>
      </div>

      {error && (
        <p className="mt-5 flex items-center justify-center gap-2 text-[13px] text-critical">
          <Icon name="ban" size={14} />{error}
        </p>
      )}
    </div>
  )
}

/**
 * One selectable row. A real <input type="radio"> underneath so the whole group
 * is keyboard- and screen-reader-navigable; the visible circle is drawn from the
 * peer state rather than by hand.
 */
function Option({ name, selected, onSelect, label, badge, badgeTone, sub, price, unit, note }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors ${
        selected
          ? 'border-ink bg-paper shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
          : 'border-line-soft bg-paper/60 hover:border-line'
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? 'border-ink' : 'border-line'
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-ink" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold text-ink">{label}</span>
          {badge && <Badge tone={badgeTone}>{badge}</Badge>}
        </span>
        {sub && <span className="mt-0.5 block text-[13px] text-muted">{sub}</span>}
      </span>

      <span className="shrink-0 text-right">
        <span className="block text-[16px] font-semibold text-ink" data-numeric>
          {price}
          {unit && <span className="ml-1 text-[13px] font-normal text-muted">{unit}</span>}
        </span>
        {note && <span className="mt-0.5 block text-[12px] text-faint" data-numeric>{note}</span>}
      </span>
    </label>
  )
}
