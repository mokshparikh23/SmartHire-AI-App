import { createAdminClient } from '@smarthire/data/supabase-server'
import { requireAdminPage } from '@/lib/auth'
import IssueLicenseForm from './IssueLicenseForm'
import LicenseTable from './LicenseTable'
import { Card, PageHeader } from '@smarthire/ui'

export const metadata = { title: 'Licenses — Admin' }

export default async function LicensesPage() {
  // See app/admin/users/page.jsx — the layout is not a sufficient boundary for a
  // service-role query.
  await requireAdminPage()

  const supabase = createAdminClient()

  const [{ data: licenses }, { data: users }] = await Promise.all([
    supabase
      .from('licenses')
      .select('*, profiles(email, full_name, credit_wallets(minutes_balance, subscription_kind))')
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, email, full_name, credit_wallets(minutes_balance, subscription_kind)')
      .order('email'),
  ])

  const active = licenses?.filter(l => l.status === 'active').length || 0

  return (
    <div>
      <PageHeader
        title="Licenses"
        lede={`${licenses?.length || 0} issued · ${active} active`}
      />

      <Card>
        <h2 className="text-[15px] font-semibold text-ink">Issue a licence</h2>
        <p className="mt-1 text-[13px] text-muted">
          The key appears on the user&rsquo;s dashboard immediately. A licence carries no plan
          and never expires — it just unlocks the app. Interview time comes from the
          account&rsquo;s credit balance or its subscription.
        </p>
        <div className="mt-5">
          <IssueLicenseForm users={users} />
        </div>
      </Card>

      <Card className="mt-5" padded={false}>
        <LicenseTable licenses={licenses} />
      </Card>
    </div>
  )
}
