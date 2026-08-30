-- ============================================================================
-- RAZORPAY 2026-08-30 — a second payment gateway, alongside Stripe.
--
-- WHY TWO. UPI and net banking are what buyers in India actually want, and both
-- are INR-only by definition. Stripe is what reaches everyone else. The site
-- already prices in two currencies from geo headers (lib/pricing.js), so the
-- gateway follows the currency it already resolved:
--
--     INR  -> Razorpay   (UPI, net banking, cards, wallets)
--     USD  -> Stripe     (international cards)
--
-- Nothing Stripe-shaped is dropped here. Its columns, its webhook and its half
-- of subscription_set() are untouched, because a live subscriber's renewal has
-- to keep landing while the Razorpay side is still being switched on. The two
-- gateways never write the same row: `gateway` says which one owns an order,
-- and each has its own id columns.
--
-- WHY NOT RENAME THE STRIPE COLUMNS TO provider_*. It would be tidier, and it
-- would also mean rewriting the Stripe webhook, the admin subscription route and
-- this function in the same change that introduces an untested gateway. Adding
-- alongside keeps the blast radius to code that did not exist yesterday.
-- ============================================================================

-- ------------------------------------------------------------ credit_orders
alter table public.credit_orders
  -- Existing rows are all Stripe, which is exactly what the default says. The
  -- CHECK is deliberately narrow: a typo'd gateway name should fail the insert
  -- rather than produce an order no webhook will ever claim.
  add column if not exists gateway text not null default 'stripe'
    check (gateway in ('stripe', 'razorpay')),

  -- The idempotency key on the Razorpay side, and the direct counterpart of
  -- stripe_checkout_session_id. UNIQUE for the same reason: it is what makes a
  -- redelivered webhook find exactly one order, and the handler's
  -- pending-status check then makes the second delivery a no-op.
  --
  -- NAMED FOR WHAT IT HOLDS. A credit pack is bought through a Razorpay Payment
  -- Link, so the id here is a `plink_…`, not the `order_…` that Razorpay also
  -- mints underneath it. Calling the column razorpay_order_id would have read as
  -- the latter and sent the next person to the wrong entity in their dashboard.
  --
  -- Postgres allows many NULLs in a unique index, so every Stripe order — and
  -- every Razorpay subscription — leaving this null costs nothing.
  add column if not exists razorpay_payment_link_id text unique,
  add column if not exists razorpay_payment_id text,

  -- UNIQUE here, unlike stripe_subscription_id on this table.
  --
  -- A Razorpay subscription has no separate checkout object to key on — the
  -- subscription IS what is created when the customer clicks buy, so this column
  -- plays the role stripe_checkout_session_id plays for Stripe and needs the same
  -- guarantee of exactly one match. Exactly one order row is created per
  -- subscription; renewals (`subscription.charged`) update wallet state and never
  -- claim an order, so they do not collide with it.
  add column if not exists razorpay_subscription_id text unique;

-- ----------------------------------------------------------- credit_wallets
alter table public.credit_wallets
  add column if not exists razorpay_customer_id text,
  add column if not exists razorpay_subscription_id text unique;

-- Mirrors credit_wallets_stripe_customer_idx. The subscription webhook looks an
-- account up by whichever id the event carries, and a sequential scan of every
-- wallet on each renewal is the kind of thing that is fine until it is not.
create index if not exists credit_wallets_razorpay_customer_idx
  on public.credit_wallets (razorpay_customer_id)
  where razorpay_customer_id is not null;

-- ========================================================== subscription_set
--
-- DROP FIRST, AND THIS IS NOT OPTIONAL.
--
-- `create or replace function` only replaces when the argument list is
-- identical. Adding two parameters — even with defaults — creates an OVERLOAD,
-- and that has two consequences, one merely annoying and one a security hole:
--
--   1. PostgREST calls this by NAMED arguments. A call carrying the original
--      seven names could satisfy both signatures, and Postgres answers an
--      ambiguous call with "function is not unique" rather than picking one.
--      Every subscription write would start failing.
--
--   2. Worse: the revoke/grant block in 20260829120000_credit_billing.sql lists
--      functions by EXACT signature, and its own comment says a revoke against a
--      stale signature "silently does nothing and leaves the function
--      world-callable". A new overload is not in that list, so it would keep
--      Postgres's default grant of EXECUTE to PUBLIC — reachable at
--      POST /rest/v1/rpc/subscription_set by anyone holding the anon key, which
--      ships in the web bundle. That is a "give myself an unlimited
--      subscription" endpoint.
--
-- So: drop the old signature, create the new one, and re-run the revoke/grant
-- against the new exact signature at the bottom of this file.
drop function if exists public.subscription_set(uuid,text,text,timestamptz,text,text,uuid);

-- Passing p_kind null clears the subscription. Credits are never touched either
-- way: a lapsed subscriber falls straight back onto whatever balance they had,
-- which is what makes cancelling safe.
--
-- The two Razorpay parameters are APPENDED, after p_actor_id, rather than being
-- slotted in beside their Stripe counterparts. Named callers do not care, but it
-- keeps any positional call that exists in a psql session or a runbook working.
create or replace function public.subscription_set(
  p_user_id       uuid,
  p_kind          text,
  p_status        text,
  p_period_end    timestamptz,
  p_stripe_customer     text default null,
  p_stripe_subscription text default null,
  p_actor_id      uuid default null,
  p_razorpay_customer     text default null,
  p_razorpay_subscription text default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind is not null and p_kind not in ('weekly', 'monthly', 'yearly') then
    return json_build_object('ok', false, 'code', 'bad_kind', 'reason', 'Unknown subscription kind');
  end if;
  if p_kind is not null and (p_status is null or p_period_end is null) then
    return json_build_object('ok', false, 'code', 'bad_shape',
                             'reason', 'A subscription needs a status and a period end');
  end if;

  insert into public.credit_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;

  update public.credit_wallets
     set subscription_kind       = p_kind,
         subscription_status     = case when p_kind is null then null else p_status end,
         subscription_period_end = case when p_kind is null then null else p_period_end end,
         stripe_customer_id      = coalesce(p_stripe_customer, stripe_customer_id),
         stripe_subscription_id  = case when p_kind is null then null
                                        else coalesce(p_stripe_subscription, stripe_subscription_id) end,

         -- Same shape as the Stripe pair above, and the same reasoning: the
         -- customer id is sticky because it outlives any one subscription, and
         -- the subscription id is cleared when the subscription is, so a
         -- cancelled account does not keep pointing at a dead Razorpay object.
         razorpay_customer_id     = coalesce(p_razorpay_customer, razorpay_customer_id),
         razorpay_subscription_id = case when p_kind is null then null
                                         else coalesce(p_razorpay_subscription, razorpay_subscription_id) end,

         updated_at              = now()
   where user_id = p_user_id;

  return json_build_object('ok', true,
    'subscriptionKind',   p_kind,
    'subscriptionStatus', case when p_kind is null then null else p_status end,
    'periodEnd',          case when p_kind is null then null else p_period_end end,
    'unlimited',          public.wallet_is_unlimited(p_user_id));
end $$;

-- The revoke half, against the NEW signature. Copied from the block in
-- 20260829120000_credit_billing.sql rather than referenced, because that block
-- names the old signature and must not be edited retroactively — a migration
-- that has already run somewhere is not a file you get to change.
--
-- If this is ever wrong, the symptom is silent: the function stays callable by
-- `authenticated`. Verify with
--     \df+ public.subscription_set
-- and check the access privileges column says service_role only.
do $$
declare f text := 'public.subscription_set(uuid,text,text,timestamptz,text,text,uuid,text,text)';
begin
  execute format('revoke all on function %s from public, anon, authenticated', f);
  execute format('grant execute on function %s to service_role', f);
end $$;

comment on column public.credit_orders.gateway is
  'Which payment gateway owns this order: stripe (USD) or razorpay (INR). Set at '
  'checkout from the currency resolved from geo headers, never from the client.';
