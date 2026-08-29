import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { userId, role } = await request.json()
    if (!userId || !role)
      return NextResponse.json({ error: 'userId and role required' }, { status: 400 })

    const admin = createAdminClient()
    const { error } = await admin
      .from('profiles')
      .update({ role })
      .eq('id', userId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}