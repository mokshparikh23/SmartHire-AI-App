import { cookies } from 'next/headers'
import { requireUser, getProfile } from '@/lib/auth'
import { listDevices, DEVICE_COOKIE, ACTIVE_WINDOW_MS } from '@/lib/devices'
import ProfileForm from '@/components/dashboard/ProfileForm'
import DeviceList from '@/components/dashboard/DeviceList'
import Icon from 'smarthire-ui/Icon'
import { Card, Badge, PageHeader } from 'smarthire-ui'
import PageTransition from '@/components/ui/PageTransition'

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

  // The cookie is how a row is matched to the browser reading the page, so the
  // list can mark one "This device" and refuse to offer a Sign out button that
  // would just log you out of the page you are on.
  const [devices, jar] = await Promise.all([listDevices(user.id), cookies()])
  const currentDeviceId = jar.get(DEVICE_COOKIE)?.value ?? null

  return (
    <PageTransition>
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

        {/*
          DEVICES 2026-08-30: "where am I signed in, and sign it out."

          Placed above the AI-credentials card because it is the only thing on
          this page someone arrives in a hurry to do — a licence key on a machine
          they no longer control is the case this exists for.
        */}
        <Card className="mt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Devices</h2>
              <p className="mt-1.5 max-w-lg text-[14px] leading-relaxed text-muted">
                Where this account is signed in. The desktop app checks its licence every
                few seconds, so signing one out takes effect almost immediately.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <DeviceList
              devices={devices}
              currentDeviceId={currentDeviceId}
              activeWindowMs={ACTIVE_WINDOW_MS}
            />
          </div>

          {/*
            Stated on the screen rather than only in a code comment, because it is
            a real limit a reader would otherwise discover by trusting the list.
            Supabase exposes no API to enumerate a user's sessions, so anything
            that has not checked in since this shipped cannot be listed — but
            "sign out everywhere else" still reaches it, because that revokes the
            sessions themselves rather than the rows.
          */}
          <p className="mt-5 flex items-start gap-2.5 border-t border-line-soft pt-4 text-[13px] leading-relaxed text-faint">
            <Icon name="shield" size={15} className="mt-0.5 shrink-0" />
            Only devices that have checked in since this feature shipped appear here. An older
            desktop build, or a browser you have not used since, will not be listed — but
            “sign out everywhere else” still ends its session.
          </p>
        </Card>

        <Card className="mt-5">
          <h2 className="text-[15px] font-semibold text-ink">AI credentials</h2>
          {/* PIVOT 2026-08-29: "licence" -> "plan", to match the credit and
              subscription model the rest of the app now uses. The card stays:
              "do I need to bring an API key?" is the question people arrive
              with, and answering it where they look for it is the point. */}
          <p className="mt-2 flex items-start gap-2.5 text-[14px] leading-relaxed text-muted">
            <Icon name="lock" size={16} className="mt-0.5 shrink-0 text-faint" />
            There is nothing to configure. Your plan covers the AI cost, and the desktop app
            ships no API credential of any kind — there is no key to paste, rotate or pay for.
          </p>
        </Card>

        <Card className="mt-5 border-critical/20">
          <h2 className="text-[15px] font-semibold text-ink">Delete account</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            Deleting your account permanently removes your licences and usage history.
            {/* PIVOT 2026-08-29: this said "Contact support to request deletion"
                with no address anywhere in the app to contact. Point at a real
                route rather than a dead end. */}
            {' '}Email us from the address on your account and we will action it.
          </p>
        </Card>
      </div>
    </PageTransition>
  )
}
