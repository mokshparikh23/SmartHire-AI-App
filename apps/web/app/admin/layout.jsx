import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AdminSidebar from '@/components/admin/AdminSidebar'

export default async function AdminLayout({ children }) {
  // Session check goes through the cookie client…
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // …but the role lookup uses the service-role client so RLS cannot hide it.
  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  return (
    <div className="flex min-h-screen bg-paper">
      <AdminSidebar profile={profile} />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-8 py-10">{children}</div>
      </main>
    </div>
  )
}
