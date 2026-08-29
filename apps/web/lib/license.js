import crypto from 'crypto'
import { createAdminClient } from './supabase-server'

// Generate a unique license key like: IA-XXXX-XXXX-XXXX-XXXX
export function generateLicenseKey() {
  const seg = () => crypto.randomBytes(2).toString('hex').toUpperCase()
  return `IA-${seg()}-${seg()}-${seg()}-${seg()}`
}

// Calculate expiry date based on plan
export function getExpiryDate(plan) {
  if (plan === 'lifetime') return null
  const date = new Date()
  if (plan === 'monthly') date.setMonth(date.getMonth() + 1)
  if (plan === 'yearly')  date.setFullYear(date.getFullYear() + 1)
  return date.toISOString()
}

// Create license after successful payment
export async function createLicense({ userId, plan, stripeSubscriptionId, stripeCustomerId }) {
  const supabase    = createAdminClient()
  const licenseKey  = generateLicenseKey()
  const expiresAt   = getExpiryDate(plan)

  const { data, error } = await supabase
    .from('licenses')
    .insert({
      user_id:                userId,
      license_key:            licenseKey,
      plan,
      status:                 'active',
      stripe_subscription_id: stripeSubscriptionId,
      stripe_customer_id:     stripeCustomerId,
      expires_at:             expiresAt
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// Validate license key (called by Electron app)
export async function validateLicense(licenseKey) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('licenses')
    .select('*, profiles(email, full_name)')
    .eq('license_key', licenseKey)
    .single()

  if (error || !data) return { valid: false, reason: 'License not found' }
  if (data.status === 'revoked')  return { valid: false, reason: 'License revoked' }
  if (data.status === 'expired')  return { valid: false, reason: 'License expired' }

  // Check expiry date for monthly/yearly
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    // Auto-mark as expired
    await supabase.from('licenses').update({ status: 'expired' }).eq('id', data.id)
    return { valid: false, reason: 'Subscription expired. Please renew.' }
  }

  return {
    valid:    true,
    plan:     data.plan,
    email:    data.profiles?.email,
    name:     data.profiles?.full_name,
    expiresAt: data.expires_at,
    // Used by the /api/ai routes to attribute usage rows to the licence holder.
    userId:   data.user_id
  }
}