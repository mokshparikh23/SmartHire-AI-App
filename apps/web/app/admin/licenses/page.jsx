import { createAdminClient } from '@/lib/supabase-server'
import IssueLicenseForm from './IssueLicenseForm'
import LicenseTable from './LicenseTable'
import { Card, PageHeader } from '@/components/ui'

export const metadata = { title: 'Licenses — Admin' }

export default async function LicensesPage() {
  const supabase = createAdminClient()

  const [{ data: licenses }, { data: users }] = await Promise.all([
    supabase
      .from('licenses')
      .select('*, profiles(email, full_name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, email, full_name')
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
          The key appears on the user&rsquo;s dashboard immediately.
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
