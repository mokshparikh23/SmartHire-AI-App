import { requireUser, getProfile, getSupabase } from '@/lib/auth'
import { getEntitlement } from '@/lib/entitlement'
import { formatBalance, balanceTone, LOW_BALANCE_MINUTES } from '@/lib/credits'
import CopyButton from '@/components/dashboard/CopyButton'
import Icon from '@/components/ui/Icon'
import { Card, Badge, Button, Stat, PageHeader } from '@/components/ui'

export const metadata = { title: 'Dashboard — Smart Hire AI' }

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

  const [profile, entitlement, { data: sessions }] = await Promise.all([
    getProfile(),
    getEntitlement(user.id),
    supabase.from('interview_sessions')
      .select('minutes_elapsed').eq('user_id', user.id),
  ])

  const { license, minutes, unlimited, subscriptionKind, periodEnd, onFreePlan } = entitlement
  const firstName = profile?.full_name?.split(' ')[0]

  const sessionCount = sessions?.length ?? 0
  const minutesUsed = (sessions ?? []).reduce((sum, s) => sum + (s.minutes_elapsed || 0), 0)

  return (
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

      {/* Free plan — the signup grant, before anyone has bought anything. */}
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
          <Button href="/dashboard/billing" className="mt-6 bg-paper text-ink hover:bg-canvas-2" iconRight="arrowRight">
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
      */}
      <Card className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-ink">Get the app</h2>
          <Badge tone="warning">
            <Icon name="clock" size={12} />
            Pending
          </Badge>
        </div>
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
      </Card>

      <p className="mt-6 flex items-center gap-2 text-[13px] text-faint">
        <Icon name="lock" size={14} />
        No API key needed — your plan covers the AI cost.
      </p>
    </div>
  )
}
