import { NextResponse } from 'next/server'
import { validateLicense } from '@/lib/license'

export async function POST(request) {
  try {
    const { licenseKey } = await request.json()
    if (!licenseKey)
      return NextResponse.json({ valid: false, reason: 'No license key provided' }, { status: 400 })

    const result = await validateLicense(licenseKey)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ valid: false, reason: e.message }, { status: 500 })
  }
}