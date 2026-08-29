import { createClient } from '@/lib/supabase-server'
import CopyButton from '@/components/dashboard/CopyButton'
import Icon from '@/components/ui/Icon'
import { Card, Badge, Button, Stat, PageHeader } from '@/components/ui'

export const metadata = { title: 'Dashboard — Interview Assistant' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  const { data: licenses } = await supabase
    .from('licenses').select('*').eq('user_id', user.id).eq('status', 'active')

  const { count: usageCount } = await supabase
    .from('usage').select('*', { count: 'exact', head: true }).eq('user_id', user.id)

  const license = licenses?.[0]
  const firstName = profile?.full_name?.split(' ')[0]

  return (
    <div>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}.` : 'Welcome back.'}
        lede="Your licence, your app, and how much you have used it."
      />

      <div className="grid gap-5 sm:grid-cols-3">
        <Stat
          label="Plan"
          value={license ? license.plan.charAt(0).toUpperCase() + license.plan.slice(1) : 'None'}
          sub={license ? 'Active' : 'No licence yet'}
          icon="sparkle"
          tone={license ? 'accent' : 'neutral'}
        />
        <Stat
          label="Licence"
          value={license ? 'Active' : 'Inactive'}
          sub={
            license?.expires_at
              ? `Until ${new Date(license.expires_at).toLocaleDateString()}`
              : license ? 'Lifetime access' : 'Nothing to activate'
          }
          icon="key"
          tone={license ? 'positive' : 'neutral'}
        />
        <Stat
          label="Sessions"
          value={usageCount || 0}
          sub="Interview sessions run"
          icon="chart"
        />
      </div>

      {!license && (
        <Card className="mt-5 bg-ink">
          <h2 className="display text-[1.75rem] text-paper">Get set up.</h2>
          <p className="mt-2.5 max-w-md text-[14px] leading-relaxed text-paper/60">
            You need an active licence to unlock the desktop app. Checkout is not open yet —
            get in touch and we will add one to your account.
          </p>
          <Button href="/dashboard/billing" className="mt-6 bg-paper text-ink hover:bg-canvas-2" iconRight="arrowRight">
            View plans
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

      <Card className="mt-5">
        <h2 className="text-[15px] font-semibold text-ink">Download the app</h2>
        <p className="mt-1.5 text-[13px] text-muted">Version 1.0.0 · A licence key is required to activate.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button as="a" href="#" variant="secondary" icon="apple">macOS</Button>
          <Button as="a" href="#" variant="secondary" icon="windows">Windows</Button>
        </div>
      </Card>

      <p className="mt-6 flex items-center gap-2 text-[13px] text-faint">
        <Icon name="lock" size={14} />
        No API key needed — your licence covers the AI cost.
      </p>
    </div>
  )
}
