import { createClient } from '@/lib/supabase-server'
import Link from 'next/link'
import CopyButton from '@/components/dashboard/CopyButton'

export const metadata = { title: 'Dashboard — Interview Assistant' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: licenses } = await supabase
    .from('licenses')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')

  const { count: usageCount } = await supabase
    .from('usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const activeLicense = licenses?.[0]

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {profile?.full_name?.split(' ')[0] || 'there'} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">Here's your account overview</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {[
          {
            label:  'Plan',
            value:  activeLicense ? activeLicense.plan.charAt(0).toUpperCase() + activeLicense.plan.slice(1) : 'No plan',
            sub:    activeLicense ? 'Active' : 'Purchase a plan to get started',
            color:  activeLicense ? 'text-green-600' : 'text-gray-400',
            bg:     activeLicense ? 'bg-green-50' : 'bg-gray-50',
            icon:   '🎯'
          },
          {
            label:  'License status',
            value:  activeLicense ? 'Active' : 'Inactive',
            sub:    activeLicense?.expires_at
              ? `Expires ${new Date(activeLicense.expires_at).toLocaleDateString()}`
              : activeLicense ? 'Lifetime access' : 'No license found',
            color:  activeLicense ? 'text-indigo-600' : 'text-gray-400',
            bg:     activeLicense ? 'bg-indigo-50' : 'bg-gray-50',
            icon:   '🔑'
          },
          {
            label:  'Total sessions',
            value:  usageCount || 0,
            sub:    'Interview sessions used',
            color:  'text-purple-600',
            bg:     'bg-purple-50',
            icon:   '📊'
          }
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{stat.label}</span>
              <span className="text-xl">{stat.icon}</span>
            </div>
            <p className={`text-2xl font-bold ${stat.color} mb-1`}>{stat.value}</p>
            <p className="text-xs text-gray-400">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* CTA if no license */}
      {!activeLicense && (
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 mb-8 text-white">
          <h2 className="text-lg font-bold mb-2">Get started with a plan</h2>
          <p className="text-indigo-200 text-sm mb-4">Purchase a license to unlock the desktop app and start acing your interviews.</p>
          <Link href="/dashboard/billing"
            className="inline-block bg-white text-indigo-600 font-semibold text-sm px-6 py-2.5 rounded-xl hover:bg-indigo-50 transition-all"
          >
            View plans →
          </Link>
        </div>
      )}

      {/* License key box */}
      {activeLicense && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Your license key</h2>
            <span className="text-xs bg-green-100 text-green-700 font-semibold px-3 py-1 rounded-full">Active</span>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <code className="text-sm font-mono text-gray-800 tracking-widest">{activeLicense.license_key}</code>
            <CopyButton text={activeLicense.license_key} />
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Enter this key in your desktop app to activate it.
          </p>
        </div>
      )}

      {/* Download section */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <h2 className="font-bold text-gray-900 mb-4">Download the app</h2>
        <div className="flex gap-3">
          <a href="#" className="flex items-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition-all">
            <span>🍎</span> Mac (.dmg)
          </a>
          <a href="#" className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all">
            <span>🪟</span> Windows (.exe)
          </a>
        </div>
        <p className="text-xs text-gray-400 mt-3">Version 1.0.0 · Requires license key to activate</p>
      </div>
    </div>
  )
}