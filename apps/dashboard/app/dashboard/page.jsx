import { requireUser, getProfile, getSupabase } from '@/lib/auth'
import { getEntitlement } from '@/lib/entitlement'
import { formatBalance, balanceTone, LOW_BALANCE_MINUTES } from '@smarthire/data/credits'
import { sweepStaleSessions } from '@smarthire/data/metering'
// import { getLatestRelease, formatSize } from '@/lib/releases'
// SIZE-LABEL 2026-09-01: formatSize is no longer called here — see DownloadButton.
import { getLatestRelease } from '@/lib/releases'
import CopyButton from '@smarthire/ui/CopyButton'
import Icon from '@smarthire/ui/Icon'
import { Card, Badge, Button, Stat, PageHeader } from '@smarthire/ui'
import PageTransition from '@/components/ui/PageTransition'

export const metadata = { title: 'Dashboard — Smart Hire AI' }

/**
 * One platform's download control.
 *
 * Enabled only when that artifact is actually in the release. macOS and Windows
 * are packaged by different CI runners, so a release genuinely can carry one
 * and not the other — a mac-only build is the normal shape of a release cut
 * before the Windows job finishes, and offering a dead Windows button is how
 * that becomes a support email.
 *
 * The href is the stable /api/download/<platform> route, never the GitHub asset
 * URL, so the version in the filename can move without touching this page.
 */
function DownloadButton({ platform, icon, label, asset }) {
  if (!asset) {
    // No href and no `as`: Button renders a next/link whenever href is set,
    // which would swallow `disabled`. Without one it is a real <button>.
    return <Button variant="secondary" icon={icon} disabled>{label}</Button>
  }

  /*
    `as="a"` is required, not decorative. Button routes an internal href
    through next/link by default, which would try to client-navigate to a
    binary instead of downloading it.
  */
  /*
    SIZE-LABEL 2026-09-01: removed on request. The byte count came from the
    release asset and was correct, but it is not something the buyer decides
    on — they have already paid, and the only question left is which platform.
    formatSize() stays exported from lib/releases so this can come straight
    back by uncommenting both lines.
  */
  // const size = formatSize(asset.size)
  return (
    <Button as="a" href={`/api/download/${platform}`} variant="secondary" icon={icon}>
      {/* {size ? `${label} · ${size}` : label} */}
      {label}
    </Button>
  )
}

export default async function DashboardPage() {
  // PIVOT 2026-08-29: was `const supabase = await createClient()` followed by an
  // un-guarded `getUser()`, then `user.id` — which threw a TypeError on a lapsed
  // session. requireUser() redirects instead, and both calls are cache()d so the
  // sidebar rendering alongside this pays nothing to ask the same questions.
  //
  // const supabase = await createClient()
  // const { data: { user } } = await supabase.auth.getUser()
  const user = await requireUser()
  const supabase = await getSupabase()

  // HONEST-LIVE 2026-08-30: same reason as the Sessions page — an unswept row is
  // still accruing minutes_elapsed against a client that stopped reporting, so
  // the "minutes used" total below was overstated until something else happened
  // to run the sweep. Ordered before the query, and fails open.
  await sweepStaleSessions(user.id).catch(() => {})

  const [profile, entitlement, { data: sessions }, release] = await Promise.all([
    getProfile(),
    getEntitlement(user.id),
    supabase.from('interview_sessions')
      .select('minutes_elapsed').eq('user_id', user.id),
    // Joins the same Promise.all rather than awaiting after it: this one is an
    // outbound HTTP call, so serialising it would add its latency to every
    // dashboard render instead of hiding it behind the Supabase queries.
    getLatestRelease(),
  ])

  const { license, minutes, unlimited, subscriptionKind, periodEnd, onFreePlan } = entitlement
  const firstName = profile?.full_name?.split(' ')[0]

  const sessionCount = sessions?.length ?? 0
  const minutesUsed = (sessions ?? []).reduce((sum, s) => sum + (s.minutes_elapsed || 0), 0)

  return (
    <PageTransition>
      <div>
        <PageHeader
          title={firstName ? `Welcome back, ${firstName}.` : 'Welcome back.'}
          lede="Your balance, your key, and where the time went."
        />

        <div className="grid gap-5 sm:grid-cols-3">
          <Stat
            label={unlimited ? 'Plan' : 'Credit balance'}
            value={unlimited ? 'Unlimited' : formatBalance(minutes)}
            sub={
              unlimited
                ? `${subscriptionKind} · renews ${periodEnd?.toLocaleDateString()}`
                : `${minutes} minute${minutes === 1 ? '' : 's'} of interview time left`
            }
            icon={unlimited ? 'infinity' : 'coin'}
            tone={unlimited ? 'accent' : balanceTone(minutes)}
          />
          <Stat
            label="Licence"
            value={license ? 'Active' : 'Inactive'}
            sub={license ? 'Key ready for the desktop app' : 'Nothing to activate yet'}
            icon="key"
            tone={license ? 'positive' : 'neutral'}
          />
          {/*
            This tile used to count rows in `usage` — AI requests — and label them
            "Sessions". Under per-minute billing that number is not just imprecise,
            it is a different quantity from the one people are paying for.
          */}
          <Stat
            label="Interview time used"
            value={formatBalance(minutesUsed)}
            sub={`Across ${sessionCount} session${sessionCount === 1 ? '' : 's'}`}
            icon="clock"
          />
        </div>

        {/*
          SIDEBAR 2026-08-30: the Free plan card moved to <Sidebar>, so it is
          visible on every dashboard route rather than only on this one — it is a
          standing state of the account, not a fact about the Overview page. It
          also stopped adding to this page's length, which is what was stretching
          the sidebar before its height was pinned.

          Its previous home, for reference:

          {onFreePlan && license && (
            <Card className="mt-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-md">
                  <div className="flex items-center gap-2.5">
                    <Icon name="gift" size={17} className="shrink-0 text-positive" />
                    <h2 className="text-[15px] font-semibold text-ink">Free plan</h2>
                  </div>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                    {minutes > 0
                      ? `Start a ${minutes} min free session, or buy credits for full-length calls.`
                      : 'Your free minutes are used up. Buy credits for full-length calls, or subscribe for unlimited time.'}
                  </p>
                </div>
                <Button href="/dashboard/billing" iconRight="arrowRight">See plans</Button>
              </div>
            </Card>
          )}
        */}

        {/* Out of credits. Distinct from "no licence": the key still works, there
            is simply nothing left to spend, and the wording has to say so or
            people read it as a broken key. */}
        {!onFreePlan && !unlimited && license && minutes <= 0 && (
          <Card className="mt-5 border-critical/25 bg-critical-soft">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-md">
                <div className="flex items-center gap-2.5">
                  <Icon name="coin" size={17} className="shrink-0 text-critical" />
                  <h2 className="text-[15px] font-semibold text-ink">You are out of credits.</h2>
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                  Your key is still valid — there is just no interview time left on the account,
                  so the desktop app will not start a new session. Top up and it appears here
                  straight away.
                </p>
              </div>
              <Button href="/dashboard/billing" iconRight="arrowRight">Get credits</Button>
            </div>
          </Card>
        )}

        {!onFreePlan && !unlimited && minutes > 0 && minutes < LOW_BALANCE_MINUTES && (
          <Card className="mt-5 flex flex-wrap items-center justify-between gap-4 border-warning/25 bg-warning-soft">
            <p className="flex items-center gap-2.5 text-[14px] text-ink-soft">
              <Icon name="hourglass" size={16} className="shrink-0 text-warning" />
              <span>
                <strong className="font-semibold text-ink" data-numeric>{formatBalance(minutes)}</strong>{' '}
                left — under one full interview.
              </span>
            </p>
            <Button href="/dashboard/billing" variant="secondary" size="sm" iconRight="arrowRight">
              Top up
            </Button>
          </Card>
        )}

        {!license && (
          <Card className="mt-5 bg-ink">
            <h2 className="display text-[1.75rem] text-paper">Get set up.</h2>
            <p className="mt-2.5 max-w-md text-[14px] leading-relaxed text-paper/60">
              You need a licence key to unlock the desktop app, and credits or a subscription
              to run a session. Every new account starts with ten free minutes.
            </p>
            {/* <Button href="/dashboard/billing" className="mt-6 bg-paper text-ink hover:bg-canvas-2" iconRight="arrowRight"> */}
            <Button href="/dashboard/billing" className="mt-6" variant="inverse" iconRight="arrowRight">
              See plans
            </Button>
          </Card>
        )}

        {license && (
          <Card className="mt-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-[15px] font-semibold text-ink">Your licence key</h2>
              <Badge tone="positive">Active</Badge>
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-line bg-canvas px-4 py-3">
              <code className="font-mono text-[13px] tracking-wider text-ink" data-numeric>
                {license.license_key}
              </code>
              <CopyButton text={license.license_key} />
            </div>
            <p className="mt-3 text-[13px] text-muted">
              Paste this into the desktop app once to activate it.
            </p>
          </Card>
        )}

        {/*
          PIVOT 2026-08-29: both buttons were href="#" — clicking them did nothing,
          and there is no artifact anywhere to point them at (no release/ directory,
          no publish block in electron-builder.config.cjs, no GitHub release). The
          hardcoded version string was also dead: nothing linked it to
          apps/desktop/package.json, so it would have gone stale on the first
          release. Replaced with an honest pending state.

          <h2 className="text-[15px] font-semibold text-ink">Download the app</h2>
          <p className="mt-1.5 text-[13px] text-muted">Version 1.0.0 · A licence key is required to activate.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button as="a" href="#" variant="secondary" icon="apple">macOS</Button>
            <Button as="a" href="#" variant="secondary" icon="windows">Windows</Button>
          </div>

          RELEASE 2026-08-30: all four blockers above are now closed —
          electron-builder has a publish block, CI packages both platforms, and
          the artifacts land on GitHub Releases. The pending markup is kept below
          rather than removed: it is still the correct rendering whenever there
          is no published build, which is what every fresh environment looks
          like. The version comes from the release feed via lib/releases.js and
          is never written down here, so the staleness that killed the original
          cannot come back.
        */}
        <Card className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-ink">Get the app</h2>
            {release ? (
              <Badge tone="positive">
                <Icon name="check" size={12} />
                Version {release.version}
              </Badge>
            ) : (
              <Badge tone="warning">
                <Icon name="clock" size={12} />
                Pending
              </Badge>
            )}
          </div>

          {release ? (
            <>
              <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">
                Install it, open it, and paste the licence key above into the activation
                screen. You only do that once per machine.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <DownloadButton
                  platform="mac" icon="apple"
                  label="macOS · Apple Silicon" asset={release.mac}
                />
                <DownloadButton
                  platform="win" icon="windows"
                  label="Windows · 64-bit" asset={release.win}
                />
              </div>
              {/*
                Not a disclaimer to bury. An unsigned build stops at a system
                dialog that says nothing about what to do next, and someone who
                has just paid reads that as a broken download rather than a
                missing certificate. The landing page FAQ already says the same
                thing; this is the moment it actually matters.

                "Do not click Move to Trash" is the load-bearing sentence. That
                dialog offers exactly two buttons — Move to Trash and Done — and
                Move to Trash is the BLUE default. The instinctive click on the
                highlighted button deletes the app the user just downloaded, and
                they have to fetch 152MB again to try the real fix. Naming the
                wrong button beats describing the right one.
              */}
              {/* UNSIGNED-NOTICE 2026-08-30: removed on request — kept in place so it
                  can come straight back if the builds are still unsigned when it matters.
              <div className="mt-4 max-w-md rounded-xl border border-line bg-canvas px-4 py-3">
                <p className="flex items-start gap-2 text-[12px] font-medium leading-relaxed text-ink-soft">
                  <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
                  <span>These builds are not signed yet, so macOS blocks the first launch.</span>
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-muted">
                  You will see &ldquo;Apple could not verify Smart Hire AI&rdquo;. Click{' '}
                  <strong className="font-medium text-ink">Done</strong> — not Move to Trash,
                  which deletes it. Then open System Settings &rsaquo; Privacy &amp; Security,
                  scroll to Security, and choose{' '}
                  <strong className="font-medium text-ink">Open Anyway</strong>.
                </p>
              </div>
              */}
            </>
          ) : (
            <>
              <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">
                The desktop builds are not published yet. Your licence key above already works — it
                activates the app the moment a build is available, and nothing here needs redoing.
              </p>
              {/* No href and no `as`: Button renders a next/link whenever href is set,
                  which would swallow `disabled`. Without one it is a real <button>, and
                  the base class list already carries disabled:pointer-events-none. */}
              <div className="mt-5 flex flex-wrap gap-3">
                <Button variant="secondary" icon="apple" disabled>macOS · Apple Silicon</Button>
                <Button variant="secondary" icon="windows" disabled>Windows · 64-bit</Button>
              </div>
            </>
          )}
        </Card>

        {/* <p className="mt-6 flex items-center gap-2 text-[13px] text-faint">
          <Icon name="lock" size={14} />
          No API key needed — your plan covers the AI cost.
        </p> */}
      </div>
    </PageTransition>
  )
}
