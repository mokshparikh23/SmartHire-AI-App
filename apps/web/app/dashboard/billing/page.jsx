import { createClient } from '@/lib/supabase-server'
import Icon from '@/components/ui/Icon'
import { Card, Badge, Button, PageHeader } from '@/components/ui'

export const metadata = { title: 'Billing — Interview Assistant' }

// Prices stay blank until a payment provider is wired up: lib/stripe.js is
// unused and the stripe package is not installed, so a number here would be a
// promise the app cannot keep.
const PLANS = [
  { id: 'monthly',  name: 'Monthly',  price: null, cadence: 'Billed monthly',  features: ['Unlimited sessions', 'All models', 'Email support'] },
  { id: 'yearly',   name: 'Yearly',   price: null, cadence: 'Billed annually', features: ['Everything in Monthly', 'Priority support'], featured: true },
  { id: 'lifetime', name: 'Lifetime', price: null, cadence: 'One payment',     features: ['Everything in Yearly', 'All future updates', 'Never expires'] },
]

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: licenses } = await supabase
    .from('licenses').select('*').eq('user_id', user.id).eq('status', 'active')

  const current = licenses?.[0]

  return (
    <div>
      <PageHeader title="Billing" lede="Your plan and what else is available." />

      <Card>
        <p className="eyebrow">Current plan</p>
        {current ? (
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="display text-[2rem] capitalize text-ink">{current.plan}</p>
              <p className="mt-1 text-[13px] text-muted">
                {current.plan === 'lifetime'
                  ? 'Lifetime access'
                  : current.expires_at
                    ? `Renews or expires ${new Date(current.expires_at).toLocaleDateString()}`
                    : 'Active'}
              </p>
            </div>
            <Button href="/dashboard/license" variant="secondary" size="sm" iconRight="arrowRight">
              View key
            </Button>
          </div>
        ) : (
          <p className="display mt-3 text-[2rem] text-faint">No active plan</p>
        )}
      </Card>

      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        {PLANS.map(plan => {
          const isCurrent = current?.plan === plan.id
          return (
            <Card key={plan.id} className={`flex flex-col ${plan.featured ? 'ring-1 ring-ink' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-semibold text-ink">{plan.name}</h2>
                {plan.featured && <Badge tone="accent">Most chosen</Badge>}
              </div>

              <p className="display mt-3 text-[1.75rem] text-ink">
                {plan.price ?? <span className="text-[15px] font-sans text-muted">Contact us</span>}
              </p>
              <p className="mt-0.5 text-[12px] text-faint">{plan.cadence}</p>

              <ul className="mt-5 flex-1 space-y-2.5 border-t border-line-soft pt-5">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px] text-ink-soft">
                    <Icon name="check" size={14} className="mt-0.5 shrink-0 text-positive" />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {isCurrent ? (
                  <Badge tone="positive" className="w-full justify-center py-2">
                    <Icon name="check" size={13} />
                    Your plan
                  </Badge>
                ) : (
                  <Button variant="secondary" className="w-full" disabled>
                    Not available online
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="mt-5 bg-canvas">
        <h2 className="text-[15px] font-semibold text-ink">How to get a licence</h2>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted">
          Online checkout is not set up yet. Licences are issued manually — get in touch and we
          will add one to your account. It appears on this dashboard straight away.
        </p>
      </Card>
    </div>
  )
}
