import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import { createLicense } from '@/lib/license'

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

    const { userId, plan } = await request.json()
    if (!userId || !plan)
      return NextResponse.json({ error: 'userId and plan are required' }, { status: 400 })

    const license = await createLicense({
      userId,
      plan,
      stripeSubscriptionId: null,
      stripeCustomerId:     null
    })

    return NextResponse.json(license)
  } catch (e) {
    console.error('Issue license error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}