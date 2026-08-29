import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'

export const metadata = { title: 'Billing — Interview Assistant' }

// Prices are intentionally blank: there is no payment provider wired up yet
// (lib/stripe.js is unused and the `stripe` package is not installed), so a
// number here would be a promise the app cannot keep. Fill these in at the
// same time you connect a real checkout flow.
const PLANS = [
  { id: 'monthly',  name: 'Monthly',  price: null, period: 'per month', blurb: 'Billed every month. Cancel any time.', features: ['Full desktop app access', 'All AI models', 'Email support'] },
  { id: 'yearly',   name: 'Yearly',   price: null, period: 'per year',  blurb: 'Billed once a year.', features: ['Everything in Monthly', 'Priority support'], highlight: true },
  { id: 'lifetime', name: 'Lifetime', price: null, period: 'one time',  blurb: 'Pay once, keep it forever.', features: ['Everything in Yearly', 'All future updates', 'Never expires'] }
]

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: licenses } = await supabase
    .from('licenses')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')

  const current = licenses?.[0]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <p className="text-gray-500 text-sm mt-1">Your plan and available options</p>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-8">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Current plan</p>
        {current ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold text-gray-900 capitalize">{current.plan}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {current.plan === 'lifetime'
                  ? 'Lifetime access'
                  : current.expires_at
                    ? `Renews or expires ${new Date(current.expires_at).toLocaleDateString()}`
                    : 'Active'}
              </p>
            </div>
            <Link href="/dashboard/license" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
              View key →
            </Link>
          </div>
        ) : (
          <p className="text-xl font-bold text-gray-400">No active plan</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {PLANS.map(plan => {
          const isCurrent = current?.plan === plan.id
          return (
            <div key={plan.id}
              className={`bg-white rounded-2xl p-6 border shadow-sm flex flex-col ${
                plan.highlight ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-gray-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-gray-900">{plan.name}</h2>
                {plan.highlight && (
                  <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
                    Popular
                  </span>
                )}
              </div>

              <p className="text-2xl font-bold text-gray-900 mt-2">
                {plan.price ?? <span className="text-base font-semibold text-gray-400">Contact us</span>}
              </p>
              <p className="text-xs text-gray-400 mb-4">{plan.price ? plan.period : plan.blurb}</p>

              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex gap-2 text-sm text-gray-600">
                    <span className="text-green-500">✓</span> {f}
                  </li>
                ))}
              </ul>

              <button
                disabled
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isCurrent
                    ? 'bg-green-50 text-green-700 cursor-default'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isCurrent ? '✓ Your plan' : 'Not available online'}
              </button>
            </div>
          )
        })}
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6">
        <h2 className="font-bold text-gray-900 mb-1">How to get a license</h2>
        <p className="text-sm text-gray-600">
          Online checkout is not set up yet. Licenses are issued manually — get in touch and
          we will add one to your account. It appears on this dashboard straight away.
        </p>
      </div>
    </div>
  )
}
