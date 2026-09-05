/**
 * KEY-SHAPE 2026-09-06 ─ refuse to hand a secret key to a browser client.
 *
 * WHAT HAPPENED. The admin console's first Vercel project was configured with
 * NEXT_PUBLIC_SUPABASE_ANON_KEY set to the `sb_secret_…` service-role key
 * instead of the `sb_publishable_…` one. Next inlines every NEXT_PUBLIC_ value
 * into the client bundle at build time, so the key that bypasses RLS on every
 * table was served as plain JavaScript from a public URL, fetchable with curl by
 * anyone who opened the login page. Nothing failed. The build was green, the
 * page rendered, and the only visible symptom was that sign-in did not work —
 * for the unrelated reason that the URL beside it was also wrong.
 *
 * WHY A RUNTIME ASSERT AT ALL. The mistake is not in this repo. It was typed
 * into a hosting dashboard, where no check of ours runs and no diff exists. The
 * only place both halves — the variable's NAME and its VALUE — are in the same
 * room is the call that consumes them, so that is where this lives.
 *
 * WHAT IT DOES NOT DO, MEASURED RATHER THAN ASSUMED. It does not stop the key
 * being published:
 *
 *     NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_secret_PROBE npm run build:admin
 *       → BUILD: SUCCEEDED, probe string present in .next/static/chunks/*.js
 *
 * Next inlines a NEXT_PUBLIC_ value everywhere the source MENTIONS it, at
 * compile time, whether or not the code reading it ever runs — and in the admin
 * console createClient() is reached only from the sign-in submit handler, so
 * nothing during a build touches it. By the time this throws, a visitor is
 * already holding the bundle. It defends the wrong end.
 *
 * scripts/assert-no-public-secrets.mjs is the gate that actually stops it, run
 * either side of `next build` in all three apps. This function stays because a
 * caught misconfiguration is still worth a precise message rather than a
 * confusing failure — but it is the second line, not the first.
 *
 * THE ASYMMETRY IS DELIBERATE. A false positive costs a failed build with a
 * message naming the variable to fix. A false negative publishes a key that
 * bypasses every row-level policy in the database. So this errs towards
 * throwing, and it only ever recognises SECRETS — it never tries to decide that
 * something is a valid publishable key, because a key format we have not seen
 * yet must not be a build failure.
 *
 * No imports, on purpose: this is reached from browser code, and the note on
 * packages/data's missing "." export explains what a stray server import costs
 * there.
 */

/** `atob` is global in browsers and in Node 16+, so no Buffer branch is needed. */
function jwtRole (key) {
  const parts = key.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(payload).role ?? null
  } catch {
    // Not a JWT we can read. Unreadable is not the same as secret — say nothing
    // rather than guess, and let the two explicit rules below decide.
    return null
  }
}

/**
 * True for a key that must never reach a browser.
 *
 * Two shapes, because Supabase projects are mid-migration between them:
 * the current `sb_secret_…` prefix, and the legacy JWT whose payload carries
 * `"role":"service_role"`. Their public counterparts are `sb_publishable_…`
 * and `"role":"anon"`.
 */
export function isSecretKey (key) {
  if (typeof key !== 'string' || !key) return false
  return key.startsWith('sb_secret_') || jwtRole(key) === 'service_role'
}

/**
 * Guard for the anon/publishable key at the point it is handed to a Supabase
 * browser client.
 *
 * `where` names the variable rather than the file, because the fix is always in
 * a hosting dashboard or a .env file and never in the code that throws.
 */
export function assertPublishableKey (key, where = 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
  if (!key) {
    throw new Error(
      `${where} is not set. The Supabase client cannot be created without it — ` +
      'set it to the project\'s publishable (sb_publishable_…) key.'
    )
  }
  if (isSecretKey(key)) {
    throw new Error(
      `${where} holds a SECRET key. Anything named NEXT_PUBLIC_* is inlined into ` +
      'the browser bundle at build time, so this would publish a key that bypasses ' +
      'row-level security on every table. Use the publishable (sb_publishable_…) key ' +
      'here, and keep the secret one in SUPABASE_SERVICE_ROLE_KEY, server-side only. ' +
      'If this key has already been deployed, rotate it before anything else.'
    )
  }
  return key
}
