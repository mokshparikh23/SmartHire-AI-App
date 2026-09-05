import { requireAdminPage } from '@/lib/auth'
import AdminSidebar from '@/components/AdminSidebar'

// PIVOT 2026-08-29: the inline session + role lookup moved to lib/auth.js so the
// layout and every admin page share ONE cached pair of round trips instead of
// each paying for its own. The old body is kept below for reference.
//
// import { createClient, createAdminClient } from '@/lib/supabase-server'
// import { redirect } from 'next/navigation'
//
//   // Session check goes through the cookie client…
//   const supabase = await createClient()
//   const { data: { user } } = await supabase.auth.getUser()
//
//   if (!user) redirect('/login')
//
//   // …but the role lookup uses the service-role client so RLS cannot hide it.
//   const { data: profile } = await createAdminClient()
//     .from('profiles')
//     .select('*')
//     .eq('id', user.id)
//     .single()
//
//   if (profile?.role !== 'admin') redirect('/dashboard')

export default async function AdminLayout({ children }) {
  // Same checks, same order, now memoised with React cache(). The admin PAGES
  // call this too — the layout is not re-executed on sibling client navigation,
  // so it cannot be the only gate.
  const profile = await requireAdminPage()

  return (
    <div className="flex min-h-screen bg-paper">
      <AdminSidebar profile={profile} />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-8 py-10">{children}</div>
      </main>
    </div>
  )
}
