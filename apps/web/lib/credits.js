/**
 * Credit constants and formatting.
 *
 * One credit is one hour of live interview time.
 *
 * MINUTES are canonical everywhere — the database, the API and the desktop app
 * all deal in whole integer minutes. "Credits" is a presentation unit and lives
 * only in this file. That is what keeps rounding out of the metering path:
 * someone who buys 2 credits owns exactly 120 minutes, not 2.0 of something
 * that has to be multiplied back out at every call site.
 *
 * Deliberately dependency-free so client components can import it. The server
 * side — anything that actually moves a balance — lives in lib/metering.js.
 */

export const MINUTES_PER_CREDIT = 60

/** Under one full interview. Every surface shows a warning below this. */
export const LOW_BALANCE_MINUTES = 60

export const creditsToMinutes = (credits) => Math.round(Number(credits || 0) * MINUTES_PER_CREDIT)

/** '4h 32m' · '4h' · '48m' · '0m'. Never returns a bare number. */
export function formatBalance(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0))
  const h = Math.floor(m / MINUTES_PER_CREDIT)
  const rest = m % MINUTES_PER_CREDIT
  if (!h) return `${rest}m`
  if (!rest) return `${h}h`
  return `${h}h ${rest}m`
}

/** '2.5 credits'. For the places that talk in the unit people actually buy. */
export function formatCredits(minutes) {
  const c = Math.round((Math.max(0, Number(minutes) || 0) / MINUTES_PER_CREDIT) * 10) / 10
  return `${c} credit${c === 1 ? '' : 's'}`
}

/** Badge / Stat tone, shared so every surface agrees on what "low" means. */
export function balanceTone(minutes) {
  const m = Number(minutes) || 0
  if (m <= 0) return 'critical'
  if (m < LOW_BALANCE_MINUTES) return 'warning'
  return 'positive'
}

/** '12:04', for a live countdown. */
export function formatClock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Human label for a credit_ledger row. */
export const LEDGER_LABEL = {
  purchase:         'Purchase',
  admin_grant:      'Credits added',
  admin_adjustment: 'Adjustment',
  signup_bonus:     'Welcome credit',
  plan_topup:       'Plan top-up',
  plan_expiry:      'Plan minutes expired',
  session_debit:    'Interview session',
  research_debit:   'Company research',
  refund:           'Refund',
  reconcile:        'Correction',
}

/** Human label for interview_sessions.end_reason. */
export const END_REASON_LABEL = {
  client_stop:     'Ended by you',
  out_of_credits:  'Out of credits',
  stale:           'Connection lost',
  superseded:      'Started elsewhere',
  license_revoked: 'Licence revoked',
  request_limit:   'Request limit reached',
  admin_stop:      'Ended by support',
}
