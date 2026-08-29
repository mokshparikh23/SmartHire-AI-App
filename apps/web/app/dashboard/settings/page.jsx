import { requireUser, getProfile } from '@/lib/auth'
import ProfileForm from '@/components/dashboard/ProfileForm'
import Icon from '@/components/ui/Icon'
import { Card, Badge, PageHeader } from '@/components/ui'

export const metadata = { title: 'Settings — Smart Hire AI' }

export default async function SettingsPage() {
  // PIVOT 2026-08-29: the un-guarded getUser() below dereferenced user.id on the
  // next line, which threw a TypeError on a lapsed session. requireUser()
  // redirects instead, and both calls are cache()d across the render pass.
  //
  // const supabase = await createClient()
  // const { data: { user } } = await supabase.auth.getUser()
  const user = await requireUser()

  // PIVOT 2026-08-29: this repeated the sidebar's profiles query verbatim, so
  // every visit to Settings fetched the same row twice. getProfile() is the same
  // query behind React cache().
  //
  // const { data: profile } = await supabase
  //   .from('profiles').select('*').eq('id', user.id).single()
  const profile = await getProfile()

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" lede="Your account details." />

      <Card>
        <h2 className="text-[15px] font-semibold text-ink">Profile</h2>
        <div className="mt-5">
          <ProfileForm profile={profile} />
        </div>
      </Card>

      <Card className="mt-5">
        <h2 className="text-[15px] font-semibold text-ink">Account</h2>
        <dl className="mt-4 divide-y divide-line-soft text-[14px]">
          <div className="flex items-center justify-between py-3">
            <dt className="text-muted">Role</dt>
            <dd>
              <Badge tone={profile?.role === 'admin' ? 'accent' : 'neutral'}>
                {profile?.role || 'user'}
              </Badge>
            </dd>
          </div>
          <div className="flex items-center justify-between py-3">
            <dt className="text-muted">Member since</dt>
            <dd className="text-ink" data-numeric>
              {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="mt-5">
        <h2 className="text-[15px] font-semibold text-ink">AI credentials</h2>
        <p className="mt-2 flex items-start gap-2.5 text-[14px] leading-relaxed text-muted">
          <Icon name="lock" size={16} className="mt-0.5 shrink-0 text-faint" />
          There is nothing to configure. Your licence covers the AI cost, and the desktop app
          never stores an API key.
        </p>
      </Card>

      <Card className="mt-5 border-critical/20">
        <h2 className="text-[15px] font-semibold text-ink">Delete account</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Deleting your account permanently removes your licences and usage history.
          Contact support to request deletion.
        </p>
      </Card>
    </div>
  )
}
