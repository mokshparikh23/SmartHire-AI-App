import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-server'

export async function POST(request) {
  try {
    const gate = await requireAdminApi()
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

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