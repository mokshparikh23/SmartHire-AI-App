import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import LicenseCard from '@/components/dashboard/LicenseCard'

export const metadata = { title: 'License — Interview Assistant' }

export default async function LicensePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: licenses } = await supabase
    .from('licenses')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const active = licenses?.filter(l => l.status === 'active') ?? []
  const past   = licenses?.filter(l => l.status !== 'active') ?? []

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">License</h1>
        <p className="text-gray-500 text-sm mt-1">Your license keys and how to activate them</p>
      </div>

      {active.length === 0 && (
        <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm text-center mb-8">
          <div className="text-3xl mb-3">🔑</div>
          <h2 className="font-bold text-gray-900 mb-1">No active license</h2>
          <p className="text-sm text-gray-500 mb-5">
            You need an active license key to use the desktop app.
          </p>
          <Link href="/dashboard/billing"
            className="inline-block bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-sm px-6 py-2.5 rounded-xl hover:opacity-90 transition-all"
          >
            View plans →
          </Link>
        </div>
      )}

      {active.length > 0 && (
        <>
          <div className="space-y-4 mb-8">
            {active.map(license => <LicenseCard key={license.id} license={license} />)}
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-8">
            <h2 className="font-bold text-gray-900 mb-4">How to activate</h2>
            <ol className="space-y-3">
              {[
                'Download and open the desktop app.',
                'Copy your license key from the card above.',
                'Paste it into the activation screen and press Activate.'
              ].map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-gray-600">
                  <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <p className="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100">
              The app re-checks your license periodically. If it is revoked, the app signs out automatically.
            </p>
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Past licenses</h2>
          <div className="space-y-4">
            {past.map(license => <LicenseCard key={license.id} license={license} />)}
          </div>
        </>
      )}
    </div>
  )
}
