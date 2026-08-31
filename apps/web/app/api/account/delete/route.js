import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getUser, getSupabase } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-server'
import { RESUME_BUCKET } from '@/lib/resume'
import { tombstone } from '@/lib/storage'
import { DEVICE_COOKIE } from '@/lib/devices'
import { AUTH_COOKIE } from '@/lib/auth-cookie'
import { DELETE_CONFIRM_WORD, matchesDeleteConfirmation } from '@/lib/delete-account'
import { cancelSubscription as cancelStripe, detachCustomerPaymentMethods } from '@/lib/stripe'
import { cancelSubscription as cancelRazorpay } from '@/lib/razorpay'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

/**
 * DELETE-ACCOUNT 2026-09-01
 *
 * Destroys the signed-in user's account, immediately and irreversibly.
 *
 * NO `OPTIONS` HANDLER AND NO CORS HEADERS. Same rule as /api/resume/parse, and
 * here it matters more than anywhere else in the product: CORS in lib/http.js is
 * `Access-Control-Allow-Origin: *`, and putting that on a cookie-authenticated
 * route that destroys an account is not a bug, it is a delete button any website
 * on the internet can press. NEVER import jsonError() into this file — it
 * attaches those headers unconditionally. That is also why this lives under
 * /api/account/ rather than next to /api/profiles/, which is the LICENCE-
 * authenticated desktop route and does answer OPTIONS with `*`.
 *
 * WHAT ACTUALLY DELETES EVERYTHING. `profiles.id references auth.users(id) on
 * delete cascade` is the only foreign key to auth.users, and every user-scoped
 * table cascades off profiles(id). So one auth.admin.deleteUser() collapses
 * licenses, credit_wallets, interview_sessions, credit_orders, credit_ledger,
 * usage, interview_profiles and devices in a single Postgres transaction. There
 * is deliberately no table-by-table teardown here: it would be a second,
 * divergent copy of the schema's own cascade graph, and the first migration that
 * added a table would silently stop deleting it.
 *
 * THREE THINGS THE CASCADE CANNOT DO, which is what the rest of this file is:
 *
 *   1. Copy the receipts out first. credit_orders is INSIDE the cascade, and a
 *      charge on someone's card has to stay answerable long after the account
 *      is gone. See the header of the billing_archive migration.
 *   2. Cancel the mandate at the gateway. Postgres has never heard of Razorpay,
 *      and a subscription created with total_count: 120 keeps debiting a real
 *      bank account monthly for ten years after the row is gone.
 *   3. Delete the bytes. storage.objects has no foreign key to anything we just
 *      destroyed, so the resume PDFs would sit in a private bucket forever with
 *      nothing pointing at them.
 *
 * FATAL VERSUS BEST-EFFORT. Every step below is labelled. The ordering is chosen
 * so that EVERY PREFIX OF THE SEQUENCE IS A RECOVERABLE STATE: everything that
 * can still be undone happens before the one call that cannot, and everything
 * after that call is cleanup the user does not need to wait on being perfect.
 * The two irreversible steps are the gateway cancel and the delete itself, in
 * that order, because "subscription cancelled, account intact" is a state a
 * human can repair and "account gone, mandate still charging" is not.
 *
 * ONE LOG LINE, AND IT CONTAINS A UUID. That is a deliberate exception to this
 * repo's never-log-PII rule: after the last line of this handler runs, the uuid
 * is the ONLY handle an operator has to correlate an incident with
 * billing_archive.deleted_user_id and storage_orphans.user_id. The email and the
 * name are never logged — they are in the archive, behind a service-role grant,
 * which is where they belong.
 */

const err = (error, status, code) =>
  NextResponse.json(code ? { error, code } : { error }, { status })

/** A payment link opened just before deleting is still capturable. */
const IN_FLIGHT_MS = 30 * 60 * 1000

export async function POST(request) {
  const started = Date.now()

  /* ── 0. auth ─────────────────────────────────────────────────── FATAL ── */
  const user = await getUser()
  if (!user) return err('Not signed in', 401)

  /*
    ── 1. origin gate ────────────────────────────────────────────── FATAL ──

    THIS IS A REAL DEFENCE HERE, not decoration, and the reason is specific to
    how this product is deployed.

    @supabase/ssr sets the auth cookie SameSite=Lax, and the usual reading of
    that is "a cross-site POST never carries it, so CSRF is impossible". Lax is a
    SITE boundary, not an ORIGIN boundary. Per the SPLIT note in
    apps/site/lib/app-links.js, the marketing site is on the root domain and this
    app is on app.<domain> — the same registrable domain, therefore same-site,
    therefore the cookie IS sent on a credentialed cross-origin POST from the
    marketing origin. Any script or HTML injection over there, or on any
    subdomain we add later, would otherwise be a working delete-my-account button
    pointed at whoever loads the page.

    A MISSING Origin is rejected too, unlike the usual advice. That advice exists
    for routes with non-browser callers; this one has none — the desktop app
    talks to /api/license/* and /api/session/*, never here — and every browser
    sends Origin on a POST.

    Compared against the request's own Host rather than a configured constant, so
    preview deploys and localhost work with nothing set. Same reasoning siteUrl()
    in lib/stripe.js gives for its request-origin fallback.
  */
  const origin = request.headers.get('origin')
  const host   = request.headers.get('host')
  let sameOrigin = false
  try {
    sameOrigin = !!origin && !!host && new URL(origin).host === host
  } catch { /* malformed Origin: not same-origin */ }
  if (!sameOrigin) return err('Forbidden', 403, 'bad_origin')

  /* ── 2. the typed word ───────────────────────────────────────── FATAL ── */
  let body
  try { body = await request.json() } catch { return err('Body must be JSON', 400) }

  if (!matchesDeleteConfirmation(body?.confirm)) {
    return err(`Type "${DELETE_CONFIRM_WORD}" to confirm.`, 400, 'confirm_mismatch')
  }

  const admin = createAdminClient()

  /*
    ── 3. profile and role ──────────────────────────────────────── FATAL ──

    Read through the SERVICE-ROLE client, mirroring getAdminProfile() in
    lib/auth.js rather than getProfile(): the admin check must fail closed, and a
    row hidden by an RLS quirk must not be able to read as "not an admin".

    maybeSingle(), not single(). A missing profile row is a half-deleted account
    left by an earlier failed attempt, not an error — there is nothing to archive
    and nothing to cancel, so fall through to the delete and the storage sweep
    and let the retry converge. single() would 503 here and make that account
    permanently undeletable, which is the worst possible resting state.
  */
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) return err('Could not load your account. Try again.', 503)

  /*
    The admin block. Three reasons, and "don't lock yourself out" is only the
    first of them:

      - The owner is the only admin. An admin deleting themselves leaves /admin
        reachable by nobody, and the way back is the Supabase SQL editor.
      - credit_ledger.actor_id is `on delete set null`. Deleting an admin
        silently nulls the actor on every credit grant they ever made to OTHER
        users — you lose the answer to "who gave this account 500 free minutes",
        across rows that do not belong to the person being deleted.
      - /api/admin/users/role has no self-check, so this is a door rather than a
        wall: demote to 'user' and the option appears. That is the right shape —
        it takes a second, deliberate act on a different page.

    The machine-readable code matters: the client renders an explanation, not a
    retryable error.
  */
  if (profile?.role === 'admin') {
    return err(
      'Admin accounts cannot be deleted from the dashboard.',
      403, 'admin_forbidden',
    )
  }

  /*
    ── 4. read the wallet BEFORE anything can clear it ──────────── FATAL ──

    The single most important fail-closed in this file.

    subscription_set(kind: null) NULLS stripe_subscription_id and
    razorpay_subscription_id, and deleteUser() destroys the row outright. After
    either, there is no way left to learn which mandate to cancel except by
    reading billing_archive. So this read happens first, and a failure here stops
    the whole thing: "we could not find out whether a live mandate exists" is not
    a state it is safe to delete an account from.
  */
  const { data: wallet, error: walletError } = await admin
    .from('credit_wallets')
    .select('subscription_kind, subscription_status, subscription_period_end, ' +
            'stripe_customer_id, stripe_subscription_id, ' +
            'razorpay_customer_id, razorpay_subscription_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (walletError) {
    return err('Could not read your billing state. Nothing was deleted.', 503)
  }

  /* ── 5. the orders ───────────────────────────────────────────── FATAL ── */
  const { data: orders, error: ordersError } = await admin
    .from('credit_orders')
    .select('*')
    .eq('user_id', user.id)

  if (ordersError) {
    return err('Could not read your billing records. Nothing was deleted.', 503)
  }

  /*
    A payment that is still capturable. A Razorpay UPI collect request sits
    pending for minutes while the customer approves it in their banking app, and
    Stripe's async methods behave the same way. Deleting through one of those
    means the webhook arrives to find no order, breaks, and the money lands
    attached to nothing — with nobody left to refund.

    409 rather than a silent proceed: this turns an unrecoverable loss into
    "try again in a couple of minutes", which is a fair thing to ask of someone
    who started a payment ninety seconds ago.
  */
  const inFlight = (orders ?? []).find(o =>
    o.status === 'pending' &&
    Date.now() - new Date(o.created_at).getTime() < IN_FLIGHT_MS)

  if (inFlight) {
    return err(
      'A payment you started is still going through. Wait a couple of minutes and try again.',
      409, 'payment_in_flight',
    )
  }

  if (orders?.length) {
    const archivedAt = new Date().toISOString()

    const rows = orders.map(o => ({
      deleted_user_id: user.id,
      // The AUTH email, not profiles.email. Nothing in the app updates
      // profiles.email, but an address changed through the Supabase dashboard
      // would leave it stale, and a receipt has to carry the address the person
      // actually uses.
      email:     user.email ?? profile?.email ?? null,
      full_name: profile?.full_name ?? null,

      order_id: o.id,
      gateway:  o.gateway,
      kind:     o.kind,
      pack_id:  o.pack_id,
      credits:       o.credits ?? 0,
      bonus_credits: o.bonus_credits ?? 0,
      subscription_kind: o.subscription_kind,
      amount_minor: o.amount_minor,
      currency:     o.currency,
      status:       o.status,
      ordered_at:   o.created_at,
      paid_at:      o.paid_at,

      stripe_checkout_session_id: o.stripe_checkout_session_id,
      stripe_payment_intent_id:   o.stripe_payment_intent_id,
      stripe_subscription_id:     o.stripe_subscription_id,
      razorpay_payment_link_id:   o.razorpay_payment_link_id,
      razorpay_payment_id:        o.razorpay_payment_id,
      razorpay_subscription_id:   o.razorpay_subscription_id,

      // Wallet-level, stamped onto every row: these are what an operator
      // searches the gateway dashboard with, and after step 7 the wallet that
      // held them does not exist.
      stripe_customer_id:   wallet?.stripe_customer_id ?? null,
      razorpay_customer_id: wallet?.razorpay_customer_id ?? null,

      archived_at: archivedAt,
    }))

    const { error: archiveError } = await admin
      .from('billing_archive')
      .upsert(rows, { onConflict: 'order_id', ignoreDuplicates: true })

    if (archiveError) {
      return err(
        'Could not save your billing records, so nothing was deleted. Try again.',
        503, 'archive_failed',
      )
    }

    /*
      PROVE IT LANDED. One cheap count standing between us and a receipt we can
      never produce again.

      ignoreDuplicates means a retry writes zero rows and reports no error, so
      "already archived" and "silently wrote nothing" are the same response.
      Counting what is actually in the table is the only thing that tells them
      apart, and it is the last moment at which the source rows still exist.
    */
    const { count, error: verifyError } = await admin
      .from('billing_archive')
      .select('order_id', { count: 'exact', head: true })
      .in('order_id', orders.map(o => o.id))

    if (verifyError || count !== orders.length) {
      return err(
        'Could not verify your billing records, so nothing was deleted. Try again.',
        503, 'archive_unverified',
      )
    }
  }

  /*
    ── 6. cancel at the gateways ───────────────────── FATAL, IRREVERSIBLE ──

    Cancel whenever an ID IS PRESENT, regardless of subscription_status.
    subscription_set() nulls the id when it clears a subscription, so a non-null
    id is by construction one the database still believes is live — and
    cancelling an already-dead one is a no-op by the helpers' contract.

    Both gateways are attempted even though only one is normally set. An account
    that moved between currencies could carry both, and "only one is ever set in
    practice" is not a thing to bet a standing bank mandate on.

    Order between them is irrelevant: either failing is fatal, and both cancels
    are idempotent, so a retry re-runs the one that succeeded as a no-op.
  */
  let stripeCancelled = false
  let razorpayCancelled = false

  if (wallet?.stripe_subscription_id) {
    try {
      const r = await cancelStripe(wallet.stripe_subscription_id)
      stripeCancelled = !r.alreadyGone
    } catch {
      return err(
        'We could not cancel your subscription with Stripe, so nothing was deleted. ' +
        'Try again in a few minutes.',
        502, 'stripe_cancel_failed',
      )
    }
  }

  if (wallet?.razorpay_subscription_id) {
    try {
      const r = await cancelRazorpay(wallet.razorpay_subscription_id)
      razorpayCancelled = !r.alreadyGone
    } catch {
      return err(
        'We could not cancel your subscription with Razorpay, so nothing was deleted. ' +
        'Try again in a few minutes.',
        502, 'razorpay_cancel_failed',
      )
    }
  }

  // Best-effort, and never fatal. Removes the saved card — the thing people mean
  // by "delete my payment details" — without touching a single invoice. The
  // Stripe CUSTOMER is deliberately left alone; see the note on the helper.
  let cardsDetached = 0
  try {
    cardsDetached = await detachCustomerPaymentMethods(wallet?.stripe_customer_id)
  } catch { /* a stranded card is a support ticket, not a failed deletion */ }

  /*
    ── 7. the point of no return ───────────────────── FATAL, IRREVERSIBLE ──

    CHECK THE RETURNED ERROR. deleteUser() does NOT throw — auth-js swallows auth
    errors into `{ data: { user: null }, error }`. An unchecked await falls
    straight through to deleting the resumes and clearing the cookies while the
    account still exists, and the user is told it worked. Worse, on their next
    login getEntitlement() -> ensureLicense() silently re-mints a licence and the
    account is fully functional again — minus the subscription step 6 just
    cancelled, which cannot be un-cancelled.

    deleteUser(id) defaults to shouldSoftDelete = false, so this is a hard delete,
    which is what "immediate and irreversible" requires. A 404 on a retry means an
    earlier attempt got this far: that is success, not failure.
  */
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)

  if (deleteError &&
      deleteError.status !== 404 &&
      deleteError.code !== 'user_not_found') {
    return err(
      'Your subscription has been cancelled, but the account could not be deleted. ' +
      'Try again — if it keeps failing, contact support.',
      500, 'delete_failed',
    )
  }

  /*
    An open interview_sessions row is deliberately NOT settled first, and this is
    a decision rather than an omission. It cascades away in the same transaction,
    and settling it would only debit a credit_wallets row that ceases to exist
    milliseconds later. The consequence, said out loud so nobody "fixes" it: a
    user who deletes their account mid-interview is never charged for those
    minutes. That is a few minutes of free time, available only to someone
    destroying their own account.

    The desktop ejects itself with no change on its side: it polls
    /api/license/validate every ten seconds, license_snapshot() returns
    found: false, and the app deletes its stored key and drops to the activation
    screen. An in-flight heartbeat gets a clean 410 no_session rather than a 500.
  */

  /*
    ── 8. the bytes ────────────────────────── BEST-EFFORT, BUT AWAITED ────

    PREFIX LISTING IS THE AUTHORITATIVE SET, not the interview_profiles rows.
    resumePath() builds every object as `${userId}/${profileId}/${uuid}.pdf`, so
    the first segment IS the owner: a prefix listing is exactly this account's
    bytes and cannot reach anyone else's, which is the same property the storage
    SELECT policy relies on. Rows would miss three real cases — a profile deleted
    earlier whose tombstone was never drained, a file whose pointer
    purge_expired_resume_files() has already nulled, and everything the cascade
    just removed the row for.

    storage.objects has no foreign key to anything deleted above, so listing
    still works after the cascade.

    AWAITED, unlike the fire-and-forget drainOrphans() in /api/resume/parse. That
    route gets away with it because there is always another request behind it.
    Here there is not: there is no user left to trigger a drain, and
    drainOrphans() only ever runs from the tail of the parse route, 25 rows at a
    time, oldest-first ACROSS ALL USERS — so on a quiet install a deleted
    account's bytes are collected never. A serverless container is also frozen
    the instant the response returns, so an unawaited promise may not run at all.

    BOUNDED, because it is awaited: 200 folders and 1000 entries per call, so a
    pathological account cannot push the request past maxDuration and turn a
    completed deletion into a frightening error.
  */
  const paths = new Set()

  try {
    const { data: folders } = await admin.storage
      .from(RESUME_BUCKET)
      .list(user.id, { limit: 1000 })

    for (const folder of (folders ?? []).slice(0, 200)) {
      const { data: files } = await admin.storage
        .from(RESUME_BUCKET)
        .list(`${user.id}/${folder.name}`, { limit: 1000 })
      for (const f of files ?? []) paths.add(`${user.id}/${folder.name}/${f.name}`)
    }
  } catch { /* the orphan rows below are the backstop */ }

  // The debt the cascade just recorded through the tombstone trigger, plus
  // anything queued earlier and never drained. Belt to the listing's braces, and
  // the only source that survives a storage API outage.
  const { data: orphans } = await admin
    .from('storage_orphans')
    .select('id, object_path')
    .eq('user_id', user.id)
    .eq('bucket_id', RESUME_BUCKET)
    .is('swept_at', null)

  for (const o of orphans ?? []) paths.add(o.object_path)

  // Chunked: remove() takes an array, and one 4000-path request is a request that
  // fails as a unit. 100 keeps each batch independently retryable.
  const list = [...paths]
  const failed = []
  let removed = 0

  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100)
    try {
      const { error } = await admin.storage.from(RESUME_BUCKET).remove(chunk)
      if (error) failed.push(...chunk)
      else removed += chunk.length
    } catch {
      failed.push(...chunk)
    }
  }

  /*
    ── 9. the orphan queue ─────────────────────────────────── BEST-EFFORT ──

    The rule is: DELETE THE ROWS ON SUCCESS, LEAVE THEM ON FAILURE.

    On failure the bytes are still in the bucket, and storage_orphans is the only
    record of where they are — this is the one table whose whole purpose is to
    outlive the row it came from, and drainOrphans() deliberately leaves rows
    unswept so the next drain retries them. Anything that came only from the
    prefix listing has no row at all, so tombstone() writes one; that insert is
    legal against a user that no longer exists precisely because
    storage_orphans.user_id has no foreign key.

    On success the rows are deleted rather than stamped swept, which is the one
    place this route departs from drainOrphans(). There is nobody left to retry
    for, and this would otherwise be the last table in the schema still holding
    the uuid of an account we told someone was destroyed.
  */
  if (failed.length) {
    for (const path of failed.slice(0, 100)) {
      await tombstone({ path, userId: user.id, reason: 'account_deleted' })
    }
  } else {
    await admin.from('storage_orphans')
      .delete()
      .eq('user_id', user.id)
      .is('swept_at', null)
  }

  /* ── 10. end the session, on the response ───────────────────────────── */
  const res = NextResponse.json({
    ok: true,
    redirect: '/login?deleted=1',
    archived: orders?.length ?? 0,
  })

  /*
    signOut() FROM A ROUTE HANDLER, which is the whole reason this is not a
    Server Action. lib/supabase-server.js wraps its setAll in try/catch — the
    standard @supabase/ssr pattern — so from an RSC this makes the network call,
    silently fails to clear the cookie, and returns as though it worked. The
    header of app/auth/device-signout/route.js documents the loop that produces.

    Safe to call AFTER deleteUser: auth-js _signOut() explicitly ignores 401, 403
    and 404 from the logout endpoint ("ignore 404s since user might not exist
    anymore") and removes the local session regardless.
  */
  try {
    const supabase = await getSupabase()
    await supabase.auth.signOut()
  } catch { /* the explicit expiries below are the backstop */ }

  /*
    BELT TO THOSE BRACES, and it is not paranoia. That same try/catch swallows a
    cookie-write failure without a trace, and the consequence here is worse than
    anywhere else in the app: proxy.js decides with getSession(), which reads the
    cookie WITHOUT a network call while the access token is more than 90s from
    expiry. A browser left holding a valid-looking JWT for a user that no longer
    exists gets /dashboard -> /login -> /dashboard for up to an hour — and unlike
    every other case in this codebase, there is no account left to sign back into.
  */
  const jar = await cookies()
  for (const c of jar.getAll()) {
    if (AUTH_COOKIE.test(c.name)) res.cookies.set(c.name, '', { path: '/', maxAge: 0 })
  }

  // Set in api/devices/register with path '/', so the path must match here or the
  // browser keeps it. It IS the device identity: a stale one would let the next
  // signup on this machine inherit a device row whose owner is gone.
  res.cookies.set(DEVICE_COOKIE, '', { path: '/', maxAge: 0 })

  console.log('[account_delete]', JSON.stringify({
    userId: user.id,
    orders: orders?.length ?? 0,
    stripeCancelled,
    razorpayCancelled,
    cardsDetached,
    filesFound:   list.length,
    filesRemoved: removed,
    filesFailed:  failed.length,
    ms: Date.now() - started,
  }))

  return res
}
