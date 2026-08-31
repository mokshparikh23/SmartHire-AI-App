import { cookies } from 'next/headers'
import { requireUser, getProfile } from '@/lib/auth'
import { listDevices, DEVICE_COOKIE, ACTIVE_WINDOW_MS } from '@/lib/devices'
import { getEntitlement } from '@/lib/entitlement'
import { formatBalance } from '@/lib/credits'
import ProfileForm from '@/components/dashboard/ProfileForm'
import DeviceList from '@/components/dashboard/DeviceList'
import DeleteAccountForm from '@/components/dashboard/DeleteAccountForm'
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
  // DELETE-ACCOUNT 2026-09-01: getEntitlement joins the existing Promise.all and
  // costs nothing. <Sidebar> already calls it on every dashboard render and it is
  // React cache()d on userId — which is the exact case the note at the top of
  // lib/entitlement.js says it was wrapped in cache() for. The Delete card needs
  // it only to decide whether there is a balance or a subscription worth warning
  // about, and both of those must be TRUE before they are said.
  //
  // const [devices, jar] = await Promise.all([listDevices(user.id), cookies()])
  const [devices, jar, entitlement] = await Promise.all([
    listDevices(user.id),
    cookies(),
    getEntitlement(user.id),
  ])
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

        {
          // REMOVED 2026-09-01: the "AI credentials" card only ever said that
          // there is nothing to configure, so it was a whole card that asked
          // for attention and then gave back no setting. Kept here rather than
          // deleted in case the question ("do I need to bring an API key?")
          // turns out to be worth answering somewhere quieter.
          //
          // <Card className="mt-5">
          //   <h2 className="text-[15px] font-semibold text-ink">AI credentials</h2>
          //   {/* PIVOT 2026-08-29: "licence" -> "plan", to match the credit and
          //       subscription model the rest of the app now uses. The card stays:
          //       "do I need to bring an API key?" is the question people arrive
          //       with, and answering it where they look for it is the point. */}
          //   <p className="mt-2 flex items-start gap-2.5 text-[14px] leading-relaxed text-muted">
          //     <Icon name="lock" size={16} className="mt-0.5 shrink-0 text-faint" />
          //     There is nothing to configure. Your plan covers the AI cost, and the desktop app
          //     ships no API credential of any kind — there is no key to paste, rotate or pay for.
          //   </p>
          // </Card>
        }

        {
          // DELETE-ACCOUNT 2026-09-01: this was a paragraph and no button.
          //
          // Two things were wrong with it. It pointed at an address the app
          // never renders — the same dead end the PIVOT note inside it was
          // written to fix, moved one sentence to the right. And its inventory
          // UNDER-PROMISED: it named "licences and usage history" while deletion
          // also takes the interview profiles, the resume text and the resume
          // PDFs behind them, the devices and whatever credit is left. A short
          // inventory is worse than none, because it is the thing the reader
          // checks before typing the word.
          //
          // <Card className="mt-5 border-critical/20">
          //   <h2 className="text-[15px] font-semibold text-ink">Delete account</h2>
          //   <p className="mt-2 text-[14px] leading-relaxed text-muted">
          //     Deleting your account permanently removes your licences and usage history.
          //     {/* PIVOT 2026-08-29: this said "Contact support to request deletion"
          //         with no address anywhere in the app to contact. Point at a real
          //         route rather than a dead end. */}
          //     {' '}Email us from the address on your account and we will action it.
          //   </p>
          // </Card>
        }

        {/* CARD-TONE 2026-09-01: `tone`, not className. The old
            `className="border-critical/20"` was measurably doing nothing — the
            computed border came out --color-line — and this is the one card in
            the app where that border is the ONLY thing marking it as dangerous.
            See the note on CARD_TONES in packages/ui/src/index.jsx.

            // <Card className="mt-5 border-critical/20"> */}
        <Card tone="critical" className="mt-5">
          {/* id so the confirmation form below can be aria-labelledby it — the
              form is a step of this card, not a thing of its own. */}
          <h2 id="delete-account-heading" className="text-[15px] font-semibold text-ink">
            Delete account
          </h2>

          {/*
            Both halves, in this order. What goes first, because that is the
            question. What stays second, because it is the surprise.

            Neither is a summary: this list is the whole reason the box below is
            worth typing into, and it stays on screen while it is being typed
            into — which is the argument against putting the confirmation in a
            modal. See the note at the top of DeleteAccountForm.jsx.

            Every noun here is checkable against a table: interview_profiles
            (job_description, resume, resume_file_path -> the resumes bucket),
            licenses, devices, usage + interview_sessions, and
            credit_wallets.minutes_balance.
          */}
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            Deleting your account is immediate and cannot be undone. It removes your interview
            profiles and everything in them — the job descriptions, the resume text you pasted
            and the resume PDFs you uploaded — along with your licences, every device this
            account is signed in on, your session history and whatever credit is left on the
            balance.
          </p>

          <p className="mt-3 text-[14px] leading-relaxed text-muted">
            One thing is kept: the receipts for anything you paid for. We are required to hold
            a record of what was charged and when. Those rows carry an amount, a date and a
            plan name — nothing about your interviews.
          </p>

          {/* Only when there is something to lose, and only what is true of THIS
              account. A permanent "you may have credits" line on an account with
              none is the kind of warning people learn to skip. Both can be true
              at once: Billing already tells the user that bought credits sit
              untouched underneath a subscription. */}
          {profile?.role !== 'admin' && (entitlement.unlimited || entitlement.minutes > 0) && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft p-4 text-[13px] leading-relaxed text-ink">
              <Icon name="warning" size={15} className="mt-0.5 shrink-0 text-warning" />
              <div className="space-y-1.5">
                {entitlement.unlimited && (
                  <p>
                    Your {entitlement.subscriptionKind} subscription is cancelled as part of
                    this. You will not be charged again, and the time left on the current
                    period is not refunded.
                  </p>
                )}
                {/* formatBalance, not a raw number, so this agrees with the
                    figure on Billing and in the sidebar. */}
                {entitlement.minutes > 0 && (
                  <p>
                    {formatBalance(entitlement.minutes)} of interview time is still on the
                    balance. It is not refunded and it does not transfer.
                  </p>
                )}
              </div>
            </div>
          )}

          {profile?.role === 'admin' ? (
            /*
              Not a disabled button. A permanently dead control on a page you
              visit often is worse than an absence, and `disabled` says "not yet"
              when the answer is "not from here". Same footnote shape as the
              Devices card above.

              The route it names is real and reachable: /api/admin/users/role has
              no self-check, so an admin can demote themselves and the option
              appears. Naming a route that does not exist is precisely the sin the
              old copy was replaced for.
            */
            <p className="mt-6 flex items-start gap-2.5 border-t border-line-soft pt-4 text-[13px] leading-relaxed text-faint">
              <Icon name="lock" size={15} className="mt-0.5 shrink-0" />
              An admin account cannot be deleted from here. Something that can grant credits and
              revoke licences should not be removable from its own settings page in three
              clicks. Set this account’s role to “user” on the Users page and the option
              appears.
            </p>
          ) : (
            <DeleteAccountForm email={profile?.email ?? user.email} />
          )}
        </Card>
      </div>
    </PageTransition>
  )
}
