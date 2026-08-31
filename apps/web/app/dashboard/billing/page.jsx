import { headers } from 'next/headers'
import { requireUser, getSupabase } from '@/lib/auth'
import { getEntitlement } from '@/lib/entitlement'
import {
  formatBalance, formatCredits, balanceTone, LOW_BALANCE_MINUTES, LEDGER_LABEL,
} from '@/lib/credits'
import {
  resolveCurrency, tiersForCurrency, packsForCurrency, singlePackForCurrency, formatMoney,
  // SPLIT 2026-09-01: for validating ?plan= and deciding which tab it belongs to.
  PACK_BY_ID, SUBSCRIPTION_TIERS,
} from 'smarthire-pricing'
import PricingPlans from '@/components/marketing/PricingPlans'
import Icon from '@/components/ui/Icon'
import { Card, Badge, Button, PageHeader, EmptyState, TH } from '@/components/ui'
import PageTransition from '@/components/ui/PageTransition'

export const metadata = { title: 'Billing — Smart Hire AI' }

const LEDGER_TONE = {
  purchase: 'positive', purchase_bonus: 'positive', refund: 'positive',
  admin_grant: 'positive', signup_bonus: 'accent',
  admin_adjustment: 'warning', reconcile: 'warning',
  session_debit: 'neutral', research_debit: 'neutral',
}

export default async function BillingPage({ searchParams }) {
  // PIVOT 2026-08-29: the un-guarded getUser() below dereferenced user.id on the
  // next line, which threw a TypeError on a lapsed session. requireUser()
  // redirects instead, and both calls are cache()d across the render pass.
  //
  // const supabase = await createClient()
  // const { data: { user } } = await supabase.auth.getUser()
  /*
    SPLIT 2026-09-01: ?plan=<packId> — the one thing that crosses the origin
    boundary from the marketing site.

    smarthire.ai has no session cookie for this host and no /api/checkout to
    call, so its Buy buttons do not fetch anything: they navigate here with the
    chosen pack in the URL, and this page — which does hold the session — takes
    it from there. A pack ID is all that travels. Never a currency, never an
    amount: resolveCurrency() below reads THIS request's geo headers, exactly as
    /api/checkout does, so the two still cannot disagree. See the SECURITY note
    in packages/pricing.

    Validated against PACK_BY_ID and dropped silently when unknown — a stale
    link or a mistyped ID should fall back to the normal page, not to an error.

    NOTHING IS SUBMITTED. The plan is only preselected; the buyer still clicks.
    Creating a credit_orders row and a Stripe session on a GET would be
    reachable by any link prefetcher, email scanner or chat unfurl that happens
    to carry a session.

    Read BEFORE requireUser() so the redirect can carry the destination — see
    the `next` note on requireUser() in lib/auth.js.
  */
  const params = await searchParams
  const checkout = params?.checkout
  const plan = PACK_BY_ID[params?.plan] ? params.plan : null

  const user = await requireUser({
    next: plan ? `/dashboard/billing?plan=${encodeURIComponent(plan)}` : '/dashboard/billing',
  })
  const supabase = await getSupabase()

  const currency = resolveCurrency(await headers())

  const [entitlement, { data: ledger }, { data: orders }] = await Promise.all([
    getEntitlement(user.id),
    supabase.from('credit_ledger')
      .select('id, minutes, balance_after, kind, note, created_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
    supabase.from('credit_orders')
      .select('id, kind, pack_id, credits, bonus_credits, subscription_kind, amount_minor, currency, status, created_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
  ])

  const { minutes, unlimited, subscriptionKind, subscriptionStatus, periodEnd, spentTotal } = entitlement

  return (
    <PageTransition>
      <div>
        <PageHeader
          title="Billing"
          lede="One credit is one hour of interview time, spent a minute at a time."
        />

        {checkout === 'success' && (
          <Card className="mb-5 border-positive/25 bg-positive-soft">
            <p className="flex items-center gap-2.5 text-[14px] text-ink-soft">
              <Icon name="check" size={16} className="shrink-0 text-positive" />
              Payment received. If the balance below has not caught up yet, refresh in a moment —
              it is confirmed by Stripe rather than by this page.
            </p>
          </Card>
        )}
        {checkout === 'cancelled' && (
          <Card className="mb-5 border-line bg-canvas">
            <p className="flex items-center gap-2.5 text-[14px] text-muted">
              <Icon name="ban" size={16} className="shrink-0 text-faint" />
              Checkout cancelled — nothing was charged.
            </p>
          </Card>
        )}

        {/* Balance hero. The number is the page. */}
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="eyebrow">{unlimited ? 'Your plan' : 'Balance'}</p>
              <p className="display mt-3 text-[3rem] leading-none text-ink" data-numeric>
                {unlimited ? 'Unlimited' : formatBalance(minutes)}
              </p>
              <p className="mt-2 text-[13px] text-muted" data-numeric>
                {unlimited
                  ? `${subscriptionKind} subscription · renews ${periodEnd?.toLocaleDateString()}`
                  : `${minutes} minutes · ${formatCredits(minutes)}`}
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              {unlimited
                ? <Badge tone={subscriptionStatus === 'past_due' ? 'warning' : 'accent'}>
                    {subscriptionStatus === 'past_due' ? 'Payment retrying' : 'Unlimited'}
                  </Badge>
                : minutes <= 0 ? <Badge tone="critical">Out of credits</Badge>
                : minutes < LOW_BALANCE_MINUTES ? <Badge tone="warning">Low balance</Badge>
                : <Badge tone={balanceTone(minutes)}>Ready to run</Badge>}
              <Button href="/dashboard/usage" variant="secondary" size="sm" iconRight="arrowRight">
                Where it went
              </Button>
            </div>
          </div>

          <p className="mt-6 flex items-start gap-2.5 border-t border-line-soft pt-5 text-[13px] leading-relaxed text-muted">
            <Icon name="hourglass" size={15} className="mt-0.5 shrink-0 text-faint" />
            {unlimited
              ? 'Sessions are not metered while your subscription is active. Any credits you have bought are untouched underneath and will still be there if you cancel.'
              : 'Time is deducted per minute while a session is live. A 30-minute interview costs 30 minutes and the rest stays here. At zero the desktop app ends the session rather than running on.'}
          </p>

          {spentTotal > 0 && (
            <p className="mt-3 text-[13px] text-faint" data-numeric>
              {formatBalance(spentTotal)} used all time.
            </p>
          )}
        </Card>

        {/* Buy more */}
        <div className="mt-8">
          <h2 className="display text-[1.5rem] text-ink">
            {unlimited ? 'Change your plan' : 'Top up'}
          </h2>
          <p className="mt-1.5 text-[14px] text-muted">
            Subscribe for unlimited interview time, or buy credits and keep whatever you do not use.
          </p>
          <div className="mt-6">
            {/* SPLIT 2026-09-01: initialPlanId / initialMode seed the selection
                from ?plan=. Both are null on a normal visit, and the component
                falls back to its own `featured` defaults exactly as before. */}
            <PricingPlans
              tiers={tiersForCurrency(currency)}
              packs={packsForCurrency(currency)}
              singlePack={singlePackForCurrency(currency)}
              signedIn
              initialPlanId={plan}
              initialMode={
                plan ? (SUBSCRIPTION_TIERS.some(t => t.id === plan) ? 'sub' : 'credits') : null
              }
            />
          </div>
        </div>

        {/* Credit history — every change to the balance, newest first. */}
        <Card className="mt-8" padded={false}>
          <div className="border-b border-line px-6 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Credit history</h2>
            <p className="mt-0.5 text-[12px] text-faint">Every change to your balance</p>
          </div>

          {!ledger?.length ? (
            <EmptyState
              icon="coin"
              title="Nothing here yet"
              description="Credits you are given and minutes you spend both appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[14px]">
                <thead>
                  <tr className="border-b border-line-soft">
                    <th className={TH}>Change</th>
                    <th className={TH}>Reason</th>
                    <th className={TH}>Note</th>
                    <th className={TH}>Balance after</th>
                    <th className={TH}>When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {ledger.map(row => {
                    const added = row.minutes >= 0
                    return (
                      <tr key={row.id} className="transition-colors hover:bg-canvas">
                        <td className="px-6 py-3.5">
                          {/* U+2212, not a hyphen — it aligns with + in tabular figures,
                              which is the whole point of a ledger column. */}
                          <span
                            className={`font-medium ${added ? 'text-positive' : 'text-ink'}`}
                            data-numeric
                          >
                            {added ? '+' : '−'}{formatBalance(Math.abs(row.minutes))}
                          </span>
                        </td>
                        <td className="px-6 py-3.5">
                          <Badge tone={LEDGER_TONE[row.kind] || 'neutral'}>
                            {LEDGER_LABEL[row.kind] || row.kind}
                          </Badge>
                        </td>
                        <td className="px-6 py-3.5 text-[13px] text-muted">{row.note || '—'}</td>
                        <td className="px-6 py-3.5 text-[13px] text-muted" data-numeric>
                          {formatBalance(row.balance_after)}
                        </td>
                        <td className="px-6 py-3.5 text-[13px] text-faint" data-numeric>
                          {new Date(row.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Receipts */}
        {orders?.length > 0 && (
          <Card className="mt-5" padded={false}>
            <div className="border-b border-line px-6 py-4">
              <h2 className="text-[15px] font-semibold text-ink">Payments</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[14px]">
                <thead>
                  <tr className="border-b border-line-soft">
                    <th className={TH}>What</th>
                    <th className={TH}>Amount</th>
                    <th className={TH}>Status</th>
                    <th className={TH}>When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {orders.map(o => (
                    <tr key={o.id} className="transition-colors hover:bg-canvas">
                      <td className="px-6 py-3.5 text-ink">
                        {o.kind === 'subscription'
                          ? `${o.subscription_kind} subscription`
                          : `${o.credits + o.bonus_credits} credits` +
                            (o.bonus_credits ? ` (${o.credits} + ${o.bonus_credits} free)` : '')}
                      </td>
                      <td className="px-6 py-3.5 text-ink" data-numeric>
                        {formatMoney(o.amount_minor, o.currency)}
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge tone={
                          o.status === 'paid' ? 'positive'
                          : o.status === 'pending' ? 'neutral'
                          : o.status === 'refunded' ? 'warning' : 'critical'
                        }>
                          {o.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5 text-[13px] text-faint" data-numeric>
                        {new Date(o.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </PageTransition>
  )
}
