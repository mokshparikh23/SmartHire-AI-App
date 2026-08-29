import { Suspense } from 'react'
import Sidebar, { SidebarSkeleton } from '@/components/dashboard/Sidebar'

/*
  PIVOT 2026-08-29: this layout used to be `async` and awaited getUser() plus a
  profiles query before rendering anything. That blocked every navigation INTO
  /dashboard, and a loading.jsx could not help: per
  node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md:86,
  "loading.js ... does NOT wrap the layout.js, template.js, or error.js in the
  same segment". The doc's own remedy (:93) is to move the data into the page or
  wrap the layout's data access in its own Suspense boundary. This does the
  latter, so the shell paints immediately and the sidebar streams in.

  The previous body, for reference:

  // import { createClient } from '@/lib/supabase-server'
  // import { redirect } from 'next/navigation'
  //
  // export default async function DashboardLayout({ children }) {
  //   const supabase = await createClient()
  //   const { data: { user } } = await supabase.auth.getUser()
  //
  //   if (!user) redirect('/login')
  //
  //   const { data: profile } = await supabase
  //     .from('profiles')
  //     .select('*')
  //     .eq('id', user.id)
  //     .single()
  //
  //   return ( ... <Sidebar profile={profile} /> ... )
  // }

  The auth check is NOT lost by going synchronous — it moved to requireUser() in
  every page (and in <Sidebar> below). That is strictly safer than before: the
  layout is not re-executed on sibling client navigation, so a layout-only gate
  never ran on a nav from /dashboard to /dashboard/usage anyway.
*/
export default function DashboardLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-paper">
      <Suspense fallback={<SidebarSkeleton />}>
        <Sidebar />
      </Suspense>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl px-8 py-10">{children}</div>
      </main>
    </div>
  )
}
