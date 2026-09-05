'use client'

// DESI-MODE 2026-08-30: useCallback, useEffect, useLayoutEffect and useRef were
// all used only by the private Tabs below, which has moved to
// ./PillTabs.jsx. useState is the only one left.
// import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from './Icon'
import PillTabs from './PillTabs'
import { Badge, Button } from './index.jsx'

/*
  DESI-MODE 2026-08-30: useIsoLayoutEffect moved to ./PillTabs.jsx
  along with the Tabs component that was its only user. Unchanged there.

  const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect
*/

/**
 * The two things Smart Hire AI sells.
 *
 * REDESIGN 2026-08-30: was two cards side by side. The reference design puts the
 * two products behind a tab switch, with the selected option's price shown large
 * on the left and the option list on the right. That is a better shape for this
 * catalogue: six purchasable things across two products is too many to compare
 * at once, and the tab makes the first decision ("unlimited, or by the hour?")
 * before the second one is even visible.
 *
 * WHAT DID NOT CHANGE, deliberately: buy(), the signed-out routing, and the fact
 * that prices arrive already resolved and formatted from the server. The client
 * never picks a currency, because a client that could pick its currency could
 * pick the cheaper one — see the SECURITY note in packages/pricing.
 */
/*
  SPLIT 2026-09-01: initialPlanId / initialMode.

  The marketing site is on another origin now and cannot start a checkout — it
  navigates to /dashboard/billing?plan=<packId> instead, and that page passes
  the pack down through these two props so the buyer arrives on the option they
  clicked rather than on the default one.

  Both default to null and every existing call site omits them, so the featured
  fallbacks below are unchanged for anyone who reaches this page normally.

  SEEDED INTO useState, NOT SYNCED WITH useEffect. These are the INITIAL
  selection; the moment the buyer touches a radio the component owns it. An
  effect that wrote the prop back on every render would fight them.
*/
/*
  SPLIT 2026-09-01: appOrigin — the prop that makes this component work on two
  origins.

  UNSET (apps/dashboard, /dashboard/billing): everything below behaves exactly as it
  always has. Same fetch, same signed-out routing, same states. That call site
  passes nothing and did not change.

  SET (apps/marketing, /pricing): buy() stops fetching entirely and navigates to
  `${appOrigin}/dashboard/billing?plan=<id>`.

  WHY NOT A CREDENTIALED CROSS-ORIGIN FETCH. apps/dashboard sends
  `Access-Control-Allow-Origin: *` and cannot narrow it — the packaged Electron
  renderer connects from file:// with origin `null`, which no allowlist can
  match — and browsers reject `*` outright for a request with credentials. The
  way round it would be to widen the Supabase auth cookie to the apex domain and
  set SameSite=None, which is three security downgrades on the endpoint that
  starts payments, to save one page load.

  A STRING, NOT A CALLBACK. This is a 'use client' component rendered by a
  Server Component; a function prop cannot cross that boundary. An origin can.
*/
export default function PricingPlans({
  tiers, packs, singlePack, signedIn,
  initialPlanId = null, initialMode = null, appOrigin = null,
}) {
  const router = useRouter()

  // const [mode, setMode] = useState('sub')
  const [mode, setMode] = useState(initialMode === 'credits' ? 'credits' : 'sub')

  // const [tierId, setTierId] = useState(tiers.find(t => t.featured)?.id ?? tiers[0]?.id)
  const [tierId, setTierId] = useState(
    (tiers.some(t => t.id === initialPlanId) ? initialPlanId : null)
      ?? tiers.find(t => t.featured)?.id ?? tiers[0]?.id
  )

  /*
    Note credit_1 cannot match here: the single credit lives in `singlePack`,
    outside the `packs` ladder, exactly as packages/pricing intends. So
    ?plan=credit_1 opens the Credits tab on the featured pack with the single
    credit still offered on the line underneath — which is the right landing for
    it, and better than preselecting the deliberately-worst per-hour rate.
  */
  // const [packId, setPackId] = useState(packs.find(p => p.featured)?.id ?? packs[0]?.id)
  const [packId, setPackId] = useState(
    (packs.some(p => p.id === initialPlanId) ? initialPlanId : null)
      ?? packs.find(p => p.featured)?.id ?? packs[0]?.id
  )
  const [pending, setPending] = useState(null)
  const [error, setError] = useState('')

  const tier = tiers.find(t => t.id === tierId)
  const pack = packs.find(p => p.id === packId)

  const buy = async (id) => {
    if (pending) return
    setError('')

    /*
      SPLIT 2026-09-01: the cross-origin path. See the note on appOrigin above.

      signedIn is deliberately not consulted here. The marketing site cannot
      know, and does not need to: /dashboard/billing answers it on the origin
      that actually holds the cookie. Signed in, the plan is preselected; signed
      out, proxy.js redirects to /login carrying ?next= so the plan survives the
      sign-in — and, since emailRedirectTo was added, the confirmation email too.
    */
    if (appOrigin) {
      window.location.href =
        `${appOrigin}/dashboard/billing?plan=${encodeURIComponent(id)}`
      return
    }

    // Checkout needs an account to hang the credits on, so an anonymous buyer
    // signs up first rather than bouncing off a Stripe page they cannot
    // complete.
    //
    /*
      This comment used to read:

        "No ?next= here: signup ends on an email-confirmation screen and returns
         through /auth/callback, so a redirect target would be dropped on the way."

      SPLIT 2026-09-01: that was true of the TARGET and not of the MECHANISM.
      /auth/callback has always read ?next= — nothing in the repo ever set one.
      The hop losing it was the confirmation link, which is exactly what
      emailRedirectTo writes, so AuthForm sets it now and the target survives.

      This branch is unreachable from apps/marketing (appOrigin returns above) and is
      reached on apps/dashboard only by a signed-out visitor who somehow got to
      /dashboard/billing, which proxy.js already prevents. Kept as the honest
      fallback rather than removed.
    */
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
      {/* DESI-MODE 2026-08-30: the private Tabs became components/ui/PillTabs.
          The rendered DOM is identical — this wrapper is the `flex justify-center`
          div that used to live inside Tabs, and PillTabs' root carries the same
          class string its inner div did. The one behavioural change is that the
          tabs now respond to arrow keys, which role="tablist" was already
          promising a screen reader user.
          <Tabs mode={mode} onChange={setMode} /> */}
      <div className="flex justify-center">
        <PillTabs
          items={[['sub', 'Subscription'], ['credits', 'Credits']]}
          value={mode}
          onChange={setMode}
          label="Billing type"
          idBase="billing"
        />
      </div>

      <div className="mt-10 overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_60px_-30px_rgba(0,0,0,0.16)]">
        {mode === 'sub' ? (
          <Panel
            kicker="Unlimited"
            price={tier?.price}
            caption={captionForTier(tier)}
            note="Every interview covered, with nothing to count. Cancel whenever — it runs to the end of the period you already paid for."
            meter={savingMeter(tiers, tier)}
            features={[
              ['check', 'Unlimited interview time'],
              /* CONCEPT 2026-08-30: the two middle lines described the
                 interviewer-side build — follow-ups after an answer, and the
                 consent tick on someone else's CV.
                 ['check', 'Follow-ups on every answer'],
                 ['check', 'Consent gate on every CV'], */
              ['check', 'An answer to every question'],
              ['check', 'Your CV and the JD as context'],
              ['check', 'Top models'],
            ]}
          >
            <Options
              name="subscription"
              items={tiers.map(t => ({
                id: t.id,
                label: t.label,
                badge: t.badge,
                badgeTone: t.kind === 'yearly' ? 'positive' : 'warning',
                price: t.price,
                unit: `/ ${t.per}`,
                note: t.perMonth
                  ? `${t.perMonthApprox ? '≈ ' : ''}${t.perMonth} / month`
                  : null,
                noteTone: t.kind === 'yearly' ? 'positive' : null,
              }))}
              selected={tierId}
              onSelect={setTierId}
            />

            <div className="mt-auto pt-8">
              <Button className="w-full" onClick={() => buy(tier.id)} disabled={!!pending}>
                {pending === tier?.id
                  ? 'Opening checkout…'
                  : `Go unlimited · ${tier?.price} ${tier?.per.toLowerCase() === 'week' ? 'a week' : tier?.per.toLowerCase() === 'year' ? 'a year' : 'a month'}`}
              </Button>
              <p className="mt-3 text-center text-[13px] text-muted">No lock-in. Cancel anytime.</p>
            </div>
          </Panel>
        ) : (
          <Panel
            kicker="Credit pack"
            price={pack?.price}
            caption={`for ${pack?.totalCredits} hours · ${pack?.perCredit} an hour`}
            note="One credit is one hour of live interview time, metered by the minute. Use 30 minutes and the other 30 stay in your account."
            meter={hoursMeter(packs, pack)}
            features={[
              ['check', 'Credits never expire'],
              ['check', 'Metered by the minute, not the session'],
              ['check', 'Top models'],
              ['close', 'Unlimited interviews'],
            ]}
          >
            <Options
              name="credits"
              items={packs.map(p => ({
                id: p.id,
                label: `${p.credits} credits`,
                badge: p.bonus ? `+${p.bonus} free` : null,
                badgeTone: 'warning',
                sub: `${p.totalCredits} hours of interviews`,
                price: p.price,
                note: `${p.perCredit} / credit`,
                noteTone: p.bonus >= 6 ? 'positive' : null,
              }))}
              selected={packId}
              onSelect={setPackId}
            />

            <div className="mt-auto pt-8">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => buy(pack.id)}
                disabled={!!pending}
              >
                {pending === pack?.id
                  ? 'Opening checkout…'
                  : `Get ${pack?.totalCredits} hours · ${pack?.price}`}
              </Button>

              {/* The single credit is deliberately outside the ladder: it exists
                  so nobody bounces off the page for want of a small option. */}
              <p className="mt-3 text-center text-[13px] text-muted">
                or, just one interview?{' '}
                <button
                  onClick={() => buy(singlePack.id)}
                  disabled={!!pending}
                  className="font-medium text-ink underline underline-offset-2 transition-colors hover:text-accent disabled:opacity-40"
                >
                  1 credit for <span data-numeric>{singlePack.price}</span>
                </button>
              </p>
            </div>
          </Panel>
        )}
      </div>

      {error && (
        <p className="mt-5 flex items-center justify-center gap-2 text-[13px] text-critical">
          <Icon name="ban" size={14} />{error}
        </p>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────── tabs */

/*
  DESI-MODE 2026-08-30: moved to ./PillTabs.jsx, generalised over an
  items array and given arrow-key navigation. Kept here per the convention in
  this repo; the call site above is the wrapper it used to render itself.

  The sliding indicator is positioned from the active tab's measured offset
  rather than a percentage, so it stays correct when the two labels are
  different widths — which they are, and which a 50% split would get wrong.

  function Tabs({ mode, onChange }) {
    const wrapRef = useRef(null)
    const [glide, setGlide] = useState({ left: 0, width: 0 })

    const measure = useCallback(() => {
      const wrap = wrapRef.current
      if (!wrap) return
      const active = wrap.querySelector('[data-active="true"]')
      if (!active) return
      setGlide({ left: active.offsetLeft, width: active.offsetWidth })
    }, [])

    // Layout effect so the indicator is in place on the first paint rather than
    // sliding in from zero on mount.
    useIsoLayoutEffect(measure, [measure, mode])

    useEffect(() => {
      window.addEventListener('resize', measure)
      // Webfonts land after hydration and change the label widths under the
      // indicator, so re-measure once they are ready.
      document.fonts?.ready.then(measure).catch(() => {})
      return () => window.removeEventListener('resize', measure)
    }, [measure])

    return (
      <div className="flex justify-center">
        <div
          ref={wrapRef}
          role="tablist"
          aria-label="Billing type"
          className="relative inline-flex gap-0.5 rounded-full border border-line bg-paper p-1.5"
        >
          <span
            aria-hidden="true"
            className="absolute bottom-1.5 top-1.5 rounded-full bg-ink transition-all duration-[450ms] ease-[cubic-bezier(0.22,0.9,0.28,1)]"
            style={{ left: glide.left, width: glide.width }}
          />
          {[['sub', 'Subscription'], ['credits', 'Credits']].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              type="button"
              data-active={mode === key}
              aria-selected={mode === key}
              onClick={() => onChange(key)}
              className={`relative z-10 rounded-full px-7 py-2.5 text-[14px] font-medium transition-colors duration-300 ${
                mode === key ? 'text-paper' : 'text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    )
  }
*/

/* ─────────────────────────────────────────────────────────────── panel */

function Panel({ kicker, price, caption, note, meter, features, children }) {
  return (
    <div className="grid lg:grid-cols-[0.86fr_1.14fr]">
      <div className="border-b border-line bg-gradient-to-b from-canvas-2 to-paper p-8 lg:border-b-0 lg:border-r">
        <p className="mono text-[11px] uppercase tracking-[0.19em] text-ink">{kicker}</p>

        <p className="hl mt-5 text-[clamp(2.75rem,6vw,4rem)] text-ink" data-numeric>
          {price}
        </p>
        <p className="mono mt-3 text-[14px] text-faint">{caption}</p>

        <p className="mt-5 min-h-[4em] text-[14px] leading-relaxed text-muted">{note}</p>

        {meter && (
          <div className="mt-7">
            <div className="mono mb-2.5 flex justify-between text-[11px] uppercase tracking-[0.08em] text-faint">
              <span>{meter.label}</span>
              <span className="text-ink">{meter.value}</span>
            </div>
            <div className="h-[7px] overflow-hidden rounded-full bg-canvas-2">
              <div
                className="h-full rounded-full bg-ink transition-[width] duration-[650ms] ease-[cubic-bezier(0.22,0.9,0.28,1)]"
                style={{ width: `${meter.pct}%` }}
              />
            </div>
          </div>
        )}

        <ul className="mt-8 space-y-2.5">
          {features.map(([icon, text]) => (
            <li
              key={text}
              className={`flex items-start gap-2.5 text-[14px] ${icon === 'close' ? 'text-faint' : 'text-ink-soft'}`}
            >
              <Icon
                name={icon}
                size={15}
                className={`mt-0.5 shrink-0 ${icon === 'close' ? 'text-line' : 'text-positive'}`}
              />
              {text}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col p-8">{children}</div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────── options */

function Options({ name, items, selected, onSelect }) {
  return (
    <div role="radiogroup" aria-label={name} className="space-y-2.5">
      {items.map(item => {
        const active = selected === item.id
        return (
          <label
            key={item.id}
            className={[
              'relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-xl border px-5 py-4',
              'transition-all duration-300',
              active
                ? 'translate-x-[3px] border-ink bg-paper shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                : 'border-line-soft bg-canvas/50 hover:border-line',
            ].join(' ')}
          >
            {/* The ink rule that slides in on the selected row. */}
            <span
              aria-hidden="true"
              className={`absolute inset-y-0 left-0 w-[3px] origin-top bg-ink transition-transform duration-[400ms] ${
                active ? 'scale-y-100' : 'scale-y-0'
              }`}
            />
            <input
              type="radio"
              name={name}
              checked={active}
              onChange={() => onSelect(item.id)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={`flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                active ? 'border-ink' : 'border-line'
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full bg-ink transition-transform duration-300 ${
                  active ? 'scale-100' : 'scale-0'
                }`}
              />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-semibold text-ink">{item.label}</span>
                {item.badge && <Badge tone={item.badgeTone}>{item.badge}</Badge>}
              </span>
              {item.sub && <span className="mt-0.5 block text-[13px] text-muted">{item.sub}</span>}
            </span>

            <span className="shrink-0 text-right">
              <span className="block text-[16px] font-semibold text-ink" data-numeric>
                {item.price}
                {item.unit && (
                  <span className="ml-1 text-[13px] font-normal text-muted">{item.unit}</span>
                )}
              </span>
              {item.note && (
                <span
                  className={`mt-0.5 block text-[12px] ${item.noteTone === 'positive' ? 'text-positive' : 'text-faint'}`}
                  data-numeric
                >
                  {item.note}
                </span>
              )}
            </span>
          </label>
        )
      })}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────── meters */

/** Monthly-equivalent cost in minor units. Mirrors resolveTier() in packages/pricing. */
function perMonthMinor(tier) {
  if (!tier) return null
  if (tier.kind === 'weekly') return Math.round(tier.amountMinor * 52 / 12)
  if (tier.kind === 'yearly') return Math.round(tier.amountMinor / 12)
  return tier.amountMinor
}

/**
 * How much the selected tier saves against the most expensive way to buy the
 * same access — the weekly tier, run for a month. Weekly itself is the baseline,
 * so it shows no saving rather than a misleading 0%.
 */
function savingMeter(tiers, tier) {
  const baseline = perMonthMinor(tiers.find(t => t.kind === 'weekly'))
  const mine = perMonthMinor(tier)
  if (!baseline || !mine || tier?.kind === 'weekly') {
    return { label: 'Saving vs weekly', value: '—', pct: 0 }
  }
  const pct = Math.round(((baseline - mine) / baseline) * 100)
  return { label: 'Saving vs weekly', value: `${pct}%`, pct }
}

/** Hours in the selected pack, against the largest pack on offer. */
function hoursMeter(packs, pack) {
  const max = Math.max(...packs.map(p => p.totalCredits), 1)
  const hours = pack?.totalCredits ?? 0
  return {
    label: 'Interview time',
    value: `${hours} hours`,
    pct: Math.round((hours / max) * 100),
  }
}

function captionForTier(tier) {
  if (!tier) return ''
  if (tier.kind === 'weekly') return `per week · ${tier.perMonth} a month`
  if (tier.kind === 'yearly') return `per year · ${tier.perMonth} a month`
  return 'per month'
}
