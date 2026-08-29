import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

export async function POST(request) {
  try {
    // Verify caller is admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { licenseId } = await request.json()
    if (!licenseId)
      return NextResponse.json({ error: 'licenseId is required' }, { status: 400 })

    const adminSupabase = createAdminClient()
    const { error } = await adminSupabase
      .from('licenses')
      .update({ status: 'revoked' })
      .eq('id', licenseId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Revoke license error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}