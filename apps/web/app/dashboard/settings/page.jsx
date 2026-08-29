import { createClient } from '@/lib/supabase-server'
import ProfileForm from '@/components/dashboard/ProfileForm'

export const metadata = { title: 'Settings — Interview Assistant' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your account</p>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-6">
        <h2 className="font-bold text-gray-900 mb-5">Profile</h2>
        <ProfileForm profile={profile} />
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-6">
        <h2 className="font-bold text-gray-900 mb-4">Account</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Role</dt>
            <dd className="font-medium text-gray-900 capitalize">{profile?.role || 'user'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Member since</dt>
            <dd className="font-medium text-gray-900">
              {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-red-100 shadow-sm">
        <h2 className="font-bold text-gray-900 mb-1">Delete account</h2>
        <p className="text-sm text-gray-500">
          Deleting your account removes your licenses and usage history permanently.
          Contact support to request deletion.
        </p>
      </div>
    </div>
  )
}
