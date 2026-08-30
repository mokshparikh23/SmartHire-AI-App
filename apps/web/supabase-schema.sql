-- Schema for the Smart Hire AI backend.
--
-- This file is the COMPLETE, RUNNABLE schema for a fresh database: paste it into
-- the Supabase SQL editor and you get the same result as replaying every
-- migration in supabase/migrations/.
--
-- DO NOT EDIT apps/web/supabase-schema.sql BY HAND — it is generated. Table
-- shapes live here; every function, policy and grant is copied verbatim out of
-- supabase/migrations/20260829120000_credit_billing.sql by
-- scripts/sync-schema.mjs, and every migration after that one is appended
-- verbatim in filename order.
--
-- That split exists because keeping the two in step by hand is exactly what
-- failed before: grants were added to the schema file in bd5df64, never reached
-- the migration, and re-opened role escalation until c548a01.
--
-- BUGFIX 2026-08-30: the appended-migrations half is new. Until then the
-- generator read only the credit-billing migration, so interview_profiles,
-- devices and touch_interview_profile() were missing from this file entirely —
-- the promise at the top was false, in the same way and for the same reason.

-- ---------------------------------------------------------------- profiles
-- One row per auth user. Created automatically by the trigger at the bottom;
-- nothing in the app inserts into this table.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- licenses
-- A licence is purely an activation credential: key -> user, active or revoked.
-- Entitlement (credit balance and subscription) lives on credit_wallets, which
-- belongs to the account rather than to any one key, so a user holding two keys
-- shares one balance.
--
-- user_id must be a real FK to profiles: PostgREST resolves the
-- .select('*, profiles(email, full_name)') embed through this constraint.
create table if not exists public.licenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  license_key text not null unique,
  status      text not null default 'active' check (status in ('active', 'revoked')),
  created_at  timestamptz not null default now()
);

create index if not exists licenses_user_id_idx     on public.licenses (user_id);
create index if not exists licenses_license_key_idx on public.licenses (license_key);

-- ---------------------------------------------------------------- credit_wallets
-- One row per account: the credit balance AND the subscription state.
--
-- Two products. CREDITS are metered per minute and never expire. A SUBSCRIPTION
-- is unlimited — sessions are not metered at all while the period is live, and
-- credits sit untouched underneath, so cancelling never destroys minutes
-- somebody paid for.
--
-- Deliberately NOT columns on public.profiles: the escalation regression fixed
-- in c548a01 was a lost `revoke update on public.profiles`, and if that recurs
-- the damage should be role escalation only, never free credits or a free
-- unlimited subscription.
create table if not exists public.credit_wallets (
  user_id             uuid primary key references public.profiles(id) on delete cascade,

  minutes_balance     integer not null default 0 check (minutes_balance >= 0),
  minutes_spent_total integer not null default 0 check (minutes_spent_total >= 0),

  subscription_kind        text check (subscription_kind in ('weekly', 'monthly', 'yearly')),
  subscription_status      text check (subscription_status in ('active', 'past_due', 'canceled')),
  subscription_period_end  timestamptz,
  stripe_customer_id       text,
  stripe_subscription_id   text unique,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- A subscription is all-or-nothing, so "unlimited" can never be half-set.
  constraint credit_wallets_subscription_complete check (
    (subscription_kind is null and subscription_status is null and subscription_period_end is null) or
    (subscription_kind is not null and subscription_status is not null and subscription_period_end is not null)
  )
);

create index if not exists credit_wallets_stripe_customer_idx
  on public.credit_wallets (stripe_customer_id) where stripe_customer_id is not null;

-- ---------------------------------------------------------------- interview_sessions
-- Anchors per-minute metering. One row per live session.
--
-- NOTE the prefixed name. This Supabase project is shared with another product,
-- and a bare `sessions` is exactly the table it is likely to own already.
create table if not exists public.interview_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  license_id        uuid references public.licenses(id) on delete set null,

  -- FROZEN at session_start from the wallet's subscription state, never
  -- re-derived. A subscription lapsing mid-session does not start charging
  -- someone halfway through an interview; one starting mid-session does not
  -- retroactively refund. The change takes effect on the next session.
  metered           boolean not null default true,

  started_at        timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at          timestamptz,

  -- minutes_elapsed is the METER POSITION and the idempotency key; it advances
  -- for subscribers too. minutes_charged is the MONEY, and is zero for them.
  minutes_elapsed   integer not null default 0 check (minutes_elapsed >= 0),
  minutes_charged   integer not null default 0 check (minutes_charged >= 0),

  -- Under an unlimited subscription this is the only cap on spend.
  ai_requests       integer not null default 0 check (ai_requests >= 0),

  end_reason        text check (end_reason in (
                      'client_stop', 'out_of_credits', 'stale', 'superseded',
                      'license_revoked', 'request_limit', 'admin_stop')),
  device_id         text,
  app_version       text,

  constraint interview_sessions_end_reason_requires_end
    check ((ended_at is null) = (end_reason is null))
);

-- At most one open session per account: the anti-double-spend guarantee at its
-- strongest, and the seat limit this product has never had, for free —
-- including for subscribers, where it is the only thing stopping one
-- "unlimited" key being shared across an office.
create unique index if not exists interview_sessions_one_open_per_user
  on public.interview_sessions (user_id) where ended_at is null;
create index if not exists interview_sessions_sweep_idx
  on public.interview_sessions (last_heartbeat_at) where ended_at is null;
create index if not exists interview_sessions_user_started_idx
  on public.interview_sessions (user_id, started_at desc);

-- ---------------------------------------------------------------- credit_orders
-- One row per checkout, for credit packs and subscriptions alike.
create table if not exists public.credit_orders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,

  kind         text not null default 'credits' check (kind in ('credits', 'subscription')),
  pack_id      text not null,

  -- What the customer PAYS for and what they RECEIVE differ on the bonus packs:
  -- "6 credits +2 free" is credits 6, bonus_credits 2, eight hours delivered.
  credits          integer not null default 0 check (credits >= 0),
  bonus_credits    integer not null default 0 check (bonus_credits >= 0),

  subscription_kind text check (subscription_kind in ('weekly', 'monthly', 'yearly')),

  amount_minor integer not null check (amount_minor >= 0),   -- paise / cents
  currency     text not null,
  status       text not null default 'pending'
                 check (status in ('pending', 'paid', 'failed', 'refunded')),

  -- The webhook idempotency key. UNIQUE, plus the pending-status check in the
  -- handler, is what makes a redelivered event a no-op.
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text,
  stripe_subscription_id     text,

  created_at   timestamptz not null default now(),
  paid_at      timestamptz,

  constraint credit_orders_shape check (
    (kind = 'credits'      and subscription_kind is null and credits > 0) or
    (kind = 'subscription' and subscription_kind is not null)
  )
);

create index if not exists credit_orders_user_idx on public.credit_orders (user_id, created_at desc);

-- ---------------------------------------------------------------- credit_ledger
-- ONE ROW PER SESSION, not one per minute. A row per minute is 60/hour/session —
-- roughly 17.5M rows a year at 100 users. Idempotency lives in
-- interview_sessions.minutes_elapsed (a column), so the ledger keeps identical
-- audit fidelity at one row.
--
-- Invariant: sum(minutes) per user = credit_wallets.minutes_balance.
-- public.credit_drift below is the check.
create table if not exists public.credit_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,

  minutes       integer not null,      -- positive = grant, negative = debit
  balance_after integer not null check (balance_after >= 0),

  kind          text not null check (kind in (
                  'purchase', 'purchase_bonus', 'admin_grant', 'admin_adjustment',
                  'signup_bonus', 'session_debit', 'research_debit',
                  'refund', 'reconcile')),

  session_id    uuid references public.interview_sessions(id) on delete set null,
  order_id      uuid references public.credit_orders(id)      on delete set null,
  actor_id      uuid references public.profiles(id)           on delete set null,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- NULLs are distinct in Postgres, so this permits unlimited grant rows
  -- (session_id null) while pinning a session to a single running row.
  constraint credit_ledger_one_row_per_session unique (session_id)
);

create index if not exists credit_ledger_user_idx    on public.credit_ledger (user_id, created_at desc);
create index if not exists credit_ledger_created_idx on public.credit_ledger (created_at desc);

-- ---------------------------------------------------------------- usage
-- Telemetry: one row per AI call. NOT the billing record — money moves only
-- through credit_ledger.
create table if not exists public.usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.interview_sessions(id) on delete set null,
  action     text,
  created_at timestamptz not null default now()
);

create index if not exists usage_user_id_idx      on public.usage (user_id);
create index if not exists usage_user_created_idx on public.usage (user_id, created_at desc);

-- ---------------------------------------------------------------- drift check
-- The wallet is a denormalised running total; the ledger is the source of truth.
-- If these disagree, a write escaped the functions below.
create or replace view public.credit_drift as
select w.user_id,
       w.minutes_balance            as wallet_total,
       coalesce(sum(l.minutes), 0)  as ledger_total
  from public.credit_wallets w
  left join public.credit_ledger l on l.user_id = w.user_id
 group by w.user_id, w.minutes_balance
having w.minutes_balance <> coalesce(sum(l.minutes), 0);

-- ---------------------------------------------------------------- RLS
-- Dashboard pages read through the cookie-session client, so each user needs
-- read access to their own rows. Admin pages and the session/licence endpoints
-- use the service-role client, which bypasses RLS entirely.
alter table public.profiles           enable row level security;
alter table public.licenses           enable row level security;
alter table public.usage              enable row level security;
alter table public.credit_wallets     enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.credit_orders      enable row level security;
alter table public.credit_ledger      enable row level security;

drop policy if exists "read own profile"   on public.profiles;
drop policy if exists "update own profile" on public.profiles;
drop policy if exists "read own licenses"  on public.licenses;
drop policy if exists "read own usage"     on public.usage;
drop policy if exists "read own wallet"    on public.credit_wallets;
drop policy if exists "read own sessions"  on public.interview_sessions;
drop policy if exists "read own orders"    on public.credit_orders;
drop policy if exists "read own ledger"    on public.credit_ledger;

create policy "read own profile"   on public.profiles           for select using (auth.uid() = id);
create policy "update own profile" on public.profiles           for update using (auth.uid() = id);
create policy "read own licenses"  on public.licenses           for select using (auth.uid() = user_id);
create policy "read own usage"     on public.usage              for select using (auth.uid() = user_id);
create policy "read own wallet"    on public.credit_wallets     for select using (auth.uid() = user_id);
create policy "read own sessions"  on public.interview_sessions for select using (auth.uid() = user_id);
create policy "read own orders"    on public.credit_orders      for select using (auth.uid() = user_id);
create policy "read own ledger"    on public.credit_ledger      for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------- grants
-- Policies decide WHICH ROWS a user may touch; grants decide whether the role
-- may touch the table at all. Both are required — with policies but no grants
-- every dashboard query fails with "permission denied for table", which reads on
-- the client as a silently empty dashboard.
--
-- supabase/config.toml has auto_expose_new_tables commented out, so nothing here
-- is granted implicitly.
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.licenses, public.usage to authenticated;
grant select on public.credit_wallets, public.interview_sessions,
                public.credit_orders,  public.credit_ledger to authenticated;

-- SELECT ONLY on the billing tables, and this is not a formality. A `grant
-- update` on credit_wallets plus the auth.uid() policy above would let any
-- signed-in user mint credits — or hand themselves an unlimited subscription —
-- from the browser console with the public anon key, which ships in the web
-- bundle.
revoke insert, update, delete on public.credit_wallets, public.interview_sessions,
                                 public.credit_orders,  public.credit_ledger
  from anon, authenticated;
revoke all on public.credit_wallets, public.interview_sessions,
              public.credit_orders,  public.credit_ledger
  from anon;

-- Writes are deliberately narrow. Everything else (issuing and revoking
-- licences, changing roles, granting credits, metering sessions) goes through
-- the service-role client in app/api/, which bypasses RLS and these grants.
--
-- The update policy above authorises the ROW; this grant authorises the COLUMN.
-- Without it a signed-in user could promote themselves with a single
-- update({ role: 'admin' }) from the browser console.
revoke update on public.profiles from authenticated, anon;
grant  update (full_name) on public.profiles to authenticated;

-- ============================================================ wallet_is_unlimited
-- The single definition of "this account is on an unlimited subscription".
--
-- One function, called from session_start and license_snapshot, so the answer
-- cannot drift between "what we bill" and "what we show". past_due deliberately
-- still counts while the period runs: Stripe retries a failed payment for days,
-- and cutting someone off mid-interview over a card that will probably clear is
-- the wrong trade.
create or replace function public.wallet_is_unlimited(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select w.subscription_status in ('active', 'past_due')
        and w.subscription_period_end > now()
       from public.credit_wallets w
      where w.user_id = p_user_id),
    false)
$$;

-- ============================================================ credit_grant
-- The only way minutes are ever added or manually removed. p_minutes may be
-- negative for a correction.
create or replace function public.credit_grant(
  p_user_id  uuid,
  p_minutes  integer,
  p_kind     text    default 'admin_grant',
  p_actor_id uuid    default null,
  p_note     text    default null,
  p_order_id uuid    default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before  integer;
  v_applied integer;
  v_after   integer;
  v_ledger  uuid;
begin
  if p_minutes is null or p_minutes = 0 then
    return json_build_object('ok', false, 'code', 'bad_amount',
                             'reason', 'minutes must be a non-zero integer');
  end if;

  insert into public.credit_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;

  select minutes_balance into v_before
    from public.credit_wallets where user_id = p_user_id for update;

  if v_before is null then
    return json_build_object('ok', false, 'code', 'no_user', 'reason', 'No such user');
  end if;

  -- A negative correction takes whatever is there and stops at zero; it can
  -- never drive the balance below it. The ledger records what was ACTUALLY
  -- applied, so sum(minutes) still reconstructs the wallet exactly, and the
  -- route surfaces requested vs applied so the admin is never surprised.
  v_applied := greatest(p_minutes, -v_before);

  if v_applied = 0 then
    return json_build_object('ok', true, 'requestedMinutes', p_minutes,
      'appliedMinutes', 0, 'minutesRemaining', v_before, 'ledgerId', null);
  end if;

  update public.credit_wallets
     set minutes_balance     = minutes_balance + v_applied,
         minutes_spent_total = minutes_spent_total + greatest(-v_applied, 0),
         updated_at          = now()
   where user_id = p_user_id
  returning minutes_balance into v_after;

  insert into public.credit_ledger
    (user_id, minutes, balance_after, kind, actor_id, note, order_id)
  values
    (p_user_id, v_applied, v_after, p_kind, p_actor_id, p_note, p_order_id)
  returning id into v_ledger;

  return json_build_object('ok', true,
    'requestedMinutes', p_minutes,
    'appliedMinutes',   v_applied,
    'minutesRemaining', v_after,
    'ledgerId',         v_ledger);
end $$;

-- ============================================================ credit_debit
-- Takes minutes for a live session, or for a one-shot charge outside one (the
-- company-research call, where p_session_id is null).
--
-- Returns the amount ACTUALLY taken, which is less than requested when the
-- balance runs out mid-charge.
create or replace function public.credit_debit(
  p_user_id    uuid,
  p_session_id uuid,
  p_minutes    integer,
  p_kind       text default 'session_debit'
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before  integer;
  v_applied integer;
  v_after   integer;
begin
  if p_minutes is null or p_minutes <= 0 then return 0; end if;

  -- FOR UPDATE rather than a bare conditional UPDATE: the ledger needs the
  -- pre-value to snapshot balance_after, and the last minute of a run-down has
  -- to be charged PARTIALLY, which RETURNING cannot express against the old row.
  -- The lock is held for the rest of the transaction, so concurrent debits for
  -- one user queue instead of both reading the same balance.
  select minutes_balance into v_before
    from public.credit_wallets where user_id = p_user_id for update;
  if v_before is null then return 0; end if;

  -- Drain to zero rather than refusing the whole charge. Refusing because only
  -- 1 of 2 minutes is affordable would let the user keep working for free.
  v_applied := least(p_minutes, v_before);
  if v_applied = 0 then return 0; end if;

  update public.credit_wallets
     set minutes_balance     = minutes_balance - v_applied,
         minutes_spent_total = minutes_spent_total + v_applied,
         updated_at          = now()
   where user_id = p_user_id
  returning minutes_balance into v_after;

  if p_session_id is null then
    insert into public.credit_ledger (user_id, minutes, balance_after, kind)
    values (p_user_id, -v_applied, v_after, p_kind);
  else
    -- One running row per session, accumulated in place.
    insert into public.credit_ledger
      (user_id, minutes, balance_after, kind, session_id)
    values
      (p_user_id, -v_applied, v_after, p_kind, p_session_id)
    on conflict (session_id) do update
      set minutes       = credit_ledger.minutes - v_applied,
          balance_after = v_after,
          updated_at    = now();
  end if;

  return v_applied;
end $$;

-- ============================================================ session_settle
-- THE ONLY PLACE THE BILLING FORMULA EXISTS. start / heartbeat / stop / sweep
-- all funnel through here, so there is one rounding rule to reason about and one
-- place to change it.
--
--   minutes_due(T) = greatest(1, ceil(epoch(T - started_at) / 60))
--
--   T = started_at -> 1   ONE MINUTE UP FRONT
--   T = 59s        -> 1   already charged; nothing happens
--   T = 60.01s     -> 2   one more minute as minute 2 begins
--   T = 90s        -> 2   minute 2 prepaid 60-120s
--
-- Charging minute 1 up front is what makes blocking the heartbeat pointless:
-- restarting a session to buy another grace window costs a minute, so the net
-- gain is nil. Prepaid minutes are never refunded, so a disconnect yields no
-- free time and partial minutes round up.
--
-- ALL TIME COMES FROM p_bill_until, which every caller derives from the server
-- clock. No client ever reports elapsed seconds, so a rewound system clock buys
-- nothing. Callers have already authenticated; this does not check the key.
--
-- An unmetered session (a subscriber) still advances the meter — that is how
-- "how many hours did we actually serve" stays answerable — but debits nothing.
create or replace function public.session_settle(
  p_session_id uuid,
  p_bill_until timestamptz,
  p_close      boolean,
  p_reason     text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s        record;
  v_due    integer;
  v_need   integer;
  v_got    integer := 0;
  v_stop   boolean := false;
  v_reason text    := p_reason;
  v_bal    integer;
begin
  -- Lock order is ALWAYS interview_sessions then credit_wallets, in every
  -- function here, so deadlock is impossible.
  select * into s from public.interview_sessions where id = p_session_id for update;
  if not found then
    return json_build_object('ok', false, 'code', 'no_session', 'reason', 'Session not found');
  end if;

  select coalesce(minutes_balance, 0) into v_bal
    from public.credit_wallets where user_id = s.user_id;

  if s.ended_at is not null then
    return json_build_object(
      'ok', true, 'sessionId', s.id, 'userId', s.user_id,
      'stop', true, 'reason', s.end_reason, 'metered', s.metered,
      'minutesRemaining', coalesce(v_bal, 0),
      'minutesElapsed',   s.minutes_elapsed,
      'minutesCharged',   s.minutes_charged,
      'elapsedSeconds',   floor(extract(epoch from (s.ended_at - s.started_at)))::int);
  end if;

  v_due  := greatest(1, ceil(extract(epoch from (p_bill_until - s.started_at)) / 60.0))::integer;
  v_need := v_due - s.minutes_elapsed;

  if v_need > 0 then
    if s.metered then
      v_got := public.credit_debit(s.user_id, s.id, v_need, 'session_debit');
      if v_got < v_need then
        v_stop   := true;
        v_reason := 'out_of_credits';
      end if;
    else
      -- Unlimited: the meter advances, the wallet does not move.
      v_got := v_need;
    end if;
  end if;

  update public.interview_sessions
     set minutes_elapsed   = minutes_elapsed + v_got,
         minutes_charged   = minutes_charged + case when s.metered then v_got else 0 end,
         -- greatest() so the sweep (which passes last_heartbeat_at) cannot
         -- rewind the clock, while a heartbeat always advances it.
         last_heartbeat_at = greatest(last_heartbeat_at, p_bill_until),
         ended_at   = case when p_close or v_stop then now() else null end,
         end_reason = case when p_close or v_stop then coalesce(v_reason, 'client_stop') else null end
   where id = s.id;

  select coalesce(minutes_balance, 0) into v_bal
    from public.credit_wallets where user_id = s.user_id;

  return json_build_object(
    'ok', true,
    'sessionId', s.id,
    'userId',    s.user_id,
    'metered',   s.metered,
    'stop',      (p_close or v_stop),
    'reason',    case when (p_close or v_stop) then coalesce(v_reason, 'client_stop') else null end,
    'minutesRemaining', coalesce(v_bal, 0),
    'minutesElapsed',   s.minutes_elapsed + v_got,
    'minutesCharged',   s.minutes_charged + case when s.metered then v_got else 0 end,
    'elapsedSeconds',   floor(extract(epoch from (p_bill_until - s.started_at)))::int);
end $$;

-- ============================================================ sweep_stale_sessions
-- The cron-free reconciler. Closes sessions whose client vanished, billing ONLY
-- up to last_heartbeat_at and never to now().
--
-- That one rule resolves fraud and over-billing simultaneously: a laptop that
-- slept for four hours is charged for the time it actually reported, and an
-- attacker who stops heartbeating gains at most one interval. Symmetric.
create or replace function public.sweep_stale_sessions(
  p_user_id       uuid    default null,
  p_stale_seconds integer default 90
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare r record; n integer := 0;
begin
  for r in
    select id, last_heartbeat_at
      from public.interview_sessions
     where ended_at is null
       and last_heartbeat_at < now() - make_interval(secs => p_stale_seconds)
       and (p_user_id is null or user_id = p_user_id)
     order by last_heartbeat_at
     limit 200
  loop
    perform public.session_settle(r.id, r.last_heartbeat_at, true, 'stale');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ============================================================ subscription_set
-- Writes the subscription state. Called by the Stripe webhook and by the admin
-- dashboard (for comps and support fixes) — never by anything a customer can
-- reach directly.
--
-- Passing p_kind null clears the subscription. Credits are never touched either
-- way: a lapsed subscriber falls straight back onto whatever balance they had,
-- which is what makes cancelling safe.
create or replace function public.subscription_set(
  p_user_id       uuid,
  p_kind          text,
  p_status        text,
  p_period_end    timestamptz,
  p_stripe_customer     text default null,
  p_stripe_subscription text default null,
  p_actor_id      uuid default null
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
         updated_at              = now()
   where user_id = p_user_id;

  return json_build_object('ok', true,
    'subscriptionKind',   p_kind,
    'subscriptionStatus', case when p_kind is null then null else p_status end,
    'periodEnd',          case when p_kind is null then null else p_period_end end,
    'unlimited',          public.wallet_is_unlimited(p_user_id));
end $$;

-- ============================================================ license_snapshot
-- One round trip for everything validateLicense needs: licence, profile,
-- balance, subscription, open session.
--
-- Returns found:false rather than raising, so the JS layer can tell "no such
-- licence" (a verdict) from "the query failed" (not a verdict). That distinction
-- is what keeps /api/license/stream from emitting valid:false on a database blip
-- — the desktop app deletes the stored key on that field.
create or replace function public.license_snapshot(
  p_license_key   text,
  p_stale_seconds integer default 90
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare l record; w record;
begin
  select li.id, li.user_id, li.status, pr.email, pr.full_name
    into l
    from public.licenses li
    join public.profiles pr on pr.id = li.user_id
   where li.license_key = p_license_key;

  if not found then return json_build_object('found', false); end if;

  -- Ride-along reconciliation. Every validate and every stream tick already pays
  -- for this round trip, so a crashed client is cleaned up by the next thing
  -- that user's app does.
  perform public.sweep_stale_sessions(l.user_id, p_stale_seconds);

  select * into w from public.credit_wallets where user_id = l.user_id;

  return json_build_object(
    'found',     true,
    'licenseId', l.id,
    'userId',    l.user_id,
    'status',    l.status,
    'email',     l.email,
    'name',      l.full_name,

    'unlimited',           public.wallet_is_unlimited(l.user_id),
    'subscriptionKind',    w.subscription_kind,
    'subscriptionStatus',  w.subscription_status,
    'subscriptionPeriodEnd', w.subscription_period_end,

    'minutesRemaining', coalesce(w.minutes_balance, 0),

    'activeSession', (select json_build_object(
                               'id', s.id, 'startedAt', s.started_at,
                               'lastHeartbeatAt', s.last_heartbeat_at,
                               'metered', s.metered,
                               'minutesElapsed', s.minutes_elapsed,
                               'minutesCharged', s.minutes_charged)
                        from public.interview_sessions s
                       where s.user_id = l.user_id and s.ended_at is null
                       limit 1));
end $$;

-- ============================================================ session_start
-- The licence key is the ONLY input that decides anything. The client sends no
-- timestamp, no duration and no entitlement.
create or replace function public.session_start(
  p_license_key   text,
  p_device_id     text    default null,
  p_app_version   text    default null,
  p_stale_seconds integer default 90
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  l           record;
  v_unlimited boolean;
  v_bal       integer;
  v_id        uuid;
  v_settle    json;
begin
  select id, user_id, status into l
    from public.licenses where license_key = p_license_key;

  if not found then
    return json_build_object('ok', false, 'code', 'not_found', 'reason', 'License not found');
  end if;
  if l.status <> 'active' then
    return json_build_object('ok', false, 'code', 'revoked', 'reason', 'License revoked');
  end if;

  insert into public.credit_wallets (user_id) values (l.user_id) on conflict (user_id) do nothing;

  -- Close anything the previous run left behind, billed to its last heartbeat.
  perform public.sweep_stale_sessions(l.user_id, p_stale_seconds);

  -- Anything still open belongs to a live client on another machine, or to this
  -- one relaunched inside the stale window. Same key means same owner, so a
  -- takeover is safe and is what someone wants after a crash. The displaced
  -- client learns on its next heartbeat.
  perform public.session_settle(s.id, now(), true, 'superseded')
     from public.interview_sessions s
    where s.user_id = l.user_id and s.ended_at is null;

  -- THE ENTITLEMENT BRANCH. It exists here and nowhere else, is derived from the
  -- wallet rather than from anything the client sent, and is frozen onto the
  -- session row for its whole life.
  v_unlimited := public.wallet_is_unlimited(l.user_id);

  select coalesce(minutes_balance, 0) into v_bal
    from public.credit_wallets where user_id = l.user_id;

  if not v_unlimited and coalesce(v_bal, 0) < 1 then
    return json_build_object('ok', false, 'code', 'out_of_credits',
      'reason', 'No session time left on your account. Add credits or subscribe to start an interview.',
      'minutesRemaining', 0);
  end if;

  insert into public.interview_sessions (user_id, license_id, metered, device_id, app_version)
  values (l.user_id, l.id, not v_unlimited, left(p_device_id, 100), left(p_app_version, 40))
  returning id into v_id;

  -- Reuses session_settle so minute 1 is taken by the same formula as every
  -- later minute.
  v_settle := public.session_settle(v_id, now(), false, null);

  return json_build_object(
    'ok', true,
    'sessionId', v_id,
    'userId',    l.user_id,
    'licenseId', l.id,
    'unlimited', v_unlimited,
    'minutesRemaining', (v_settle->>'minutesRemaining')::int,
    'minutesCharged',   (v_settle->>'minutesCharged')::int,
    'startedAt', now());
end $$;

-- ============================================================ session_heartbeat
-- Called by the desktop on a timer AND by /api/ai/* before every upstream call,
-- so the meter advances even if the client's timer is broken or patched out.
--
-- `stop` is DATA, not an error: the route returns it with HTTP 200. A 4xx would
-- drive the desktop's error path, and its error path is a logout.
create or replace function public.session_heartbeat(
  p_session_id   uuid,
  p_license_key  text,
  p_ai_request   boolean default false,
  p_max_requests integer default 600
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare s record; l record;
begin
  select * into s from public.interview_sessions where id = p_session_id for update;
  if not found then
    return json_build_object('ok', false, 'code', 'no_session', 'reason', 'Session not found');
  end if;

  select id, license_key, status into l from public.licenses where id = s.license_id;

  -- A session id alone is not a credential: it must be presented with the key
  -- that opened it.
  if not found or l.license_key is distinct from p_license_key then
    return json_build_object('ok', false, 'code', 'forbidden',
                             'reason', 'Session does not belong to this licence');
  end if;

  if s.ended_at is not null then
    return public.session_settle(s.id, s.last_heartbeat_at, true, s.end_reason);
  end if;

  -- Revocation kills a live session on the next beat, server-side, without
  -- depending on the SSE stream reaching the client.
  if l.status <> 'active' then
    return public.session_settle(s.id, now(), true, 'license_revoked');
  end if;

  if p_ai_request then
    -- Under an unlimited subscription this is the ONLY cap on spend, so it is
    -- load-bearing rather than defensive.
    if s.ai_requests >= p_max_requests then
      return public.session_settle(s.id, now(), true, 'request_limit');
    end if;
    update public.interview_sessions set ai_requests = ai_requests + 1 where id = s.id;
  end if;

  return public.session_settle(s.id, now(), false, null);
end $$;

-- ============================================================ session_stop
create or replace function public.session_stop(
  p_session_id  uuid,
  p_license_key text,
  p_reason      text default 'client_stop'
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare s record; l record;
begin
  select * into s from public.interview_sessions where id = p_session_id for update;
  if not found then
    return json_build_object('ok', false, 'code', 'no_session', 'reason', 'Session not found');
  end if;

  select license_key into l from public.licenses where id = s.license_id;
  if l.license_key is distinct from p_license_key then
    return json_build_object('ok', false, 'code', 'forbidden',
                             'reason', 'Session does not belong to this licence');
  end if;

  return public.session_settle(
    s.id, now(), true,
    case when p_reason in ('client_stop', 'admin_stop', 'out_of_credits')
         then p_reason else 'client_stop' end);
end $$;

-- ============================================================ function grants
-- CRITICAL, and the single most load-bearing block in this file.
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and PUBLIC
-- includes `authenticated`. `public` is an exposed schema in
-- supabase/config.toml, so without these revokes every function above is
-- reachable at POST /rest/v1/rpc/<name> from any signed-in browser holding the
-- anon key — which ships in the web bundle. That would hand every user both a
-- "give myself credits" and a "give myself an unlimited subscription" endpoint.
--
-- `security definer set search_path = public` on each function is
-- belt-and-braces. THIS is what actually protects them. They are called only
-- from app/api/ through createAdminClient().
--
-- The signatures must match EXACTLY: a revoke against a stale signature
-- silently does nothing and leaves the function world-callable.
do $$
declare f text;
begin
  foreach f in array array[
    'public.wallet_is_unlimited(uuid)',
    'public.credit_grant(uuid,integer,text,uuid,text,uuid)',
    'public.credit_debit(uuid,uuid,integer,text)',
    'public.session_settle(uuid,timestamptz,boolean,text)',
    'public.sweep_stale_sessions(uuid,integer)',
    'public.subscription_set(uuid,text,text,timestamptz,text,text,uuid)',
    'public.license_snapshot(text,integer)',
    'public.session_start(text,text,text,integer)',
    'public.session_heartbeat(uuid,text,boolean,integer)',
    'public.session_stop(uuid,text,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ============================================================ profile trigger
-- Extended rather than replaced by a second trigger, so the anonymous-user guard
-- stays in exactly one place.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare v_wallet uuid;
begin
  -- This database is shared with another product that signs users in
  -- anonymously. Those sessions have no email and never use the desktop app, so
  -- skip them instead of filling the admin user list with blank rows — and, now,
  -- instead of minting free credits for them.
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;

  -- Ten free minutes: enough to run one real interview end to end before
  -- deciding whether to buy. Written straight rather than through credit_grant
  -- so the trigger stays independent of that function's signature.
  --
  -- RETURNING is what keeps the ledger honest: on a replayed insert the wallet
  -- already exists, nothing comes back, and no second bonus row is written.
  insert into public.credit_wallets (user_id, minutes_balance)
  values (new.id, 10)
  on conflict (user_id) do nothing
  returning user_id into v_wallet;

  if v_wallet is not null then
    insert into public.credit_ledger (user_id, minutes, balance_after, kind, note)
    values (new.id, 10, 10, 'signup_bonus', '10-minute demo');
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================ 20260830000000_interview_profiles.sql
-- SETUP-TO-WEB 2026-08-30
--
-- Interview setup moves out of the desktop app and onto the web.
--
-- Until now company/role/résumé/JD lived only in the desktop's zustand store,
-- persisted to localStorage under 'ia-settings' — invisible to the account,
-- lost on reinstall, and re-entered through a three-step wizard before every
-- interview. This table is the server-side home for it, one row per candidate
-- the user is going to interview. The desktop stops collecting any of it and
-- just picks a row.
--
-- WHY THE CONSENT FLAG LIVES HERE
--
-- resume_consent records that the candidate agreed to their résumé being used
-- by the copilot. It travels WITH the résumé, in the same row, because the two
-- are only ever meaningful together: a résumé whose consent state has been
-- separated from it is a résumé nobody can safely use.
--
-- This column is not the enforcement point. buildSystemPrompt() in
-- apps/desktop/src/services/systemPrompt.js is — it omits the RESUME section
-- entirely when the flag is false, so an unconsented résumé cannot reach the
-- model even if a UI or an API caller ignores this column. Storing the flag
-- here just means the question is asked once, when the profile is created,
-- instead of before every session.

create table if not exists public.interview_profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,

  candidate_name  text not null,
  company         text,
  role            text,

  resume          text,
  resume_consent  boolean not null default false,
  job_description text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The desktop lists these newest-first for one user on every launch.
create index if not exists interview_profiles_user_idx
  on public.interview_profiles (user_id, created_at desc);

-- ============================================================ RLS
alter table public.interview_profiles enable row level security;

drop policy if exists "read own interview profiles"   on public.interview_profiles;
drop policy if exists "insert own interview profiles" on public.interview_profiles;
drop policy if exists "update own interview profiles" on public.interview_profiles;
drop policy if exists "delete own interview profiles" on public.interview_profiles;

create policy "read own interview profiles"
  on public.interview_profiles for select
  using (auth.uid() = user_id);

-- with check on insert, using+with check on update: `using` decides which rows
-- may be touched, `with check` decides what they may be turned INTO. Without
-- the latter on update, a user could re-assign user_id and hand a row — résumé
-- included — to another account.
create policy "insert own interview profiles"
  on public.interview_profiles for insert
  with check (auth.uid() = user_id);

create policy "update own interview profiles"
  on public.interview_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own interview profiles"
  on public.interview_profiles for delete
  using (auth.uid() = user_id);

-- ============================================================ grants
-- config.toml has auto_expose_new_tables commented out, so a new table is
-- invisible to the Data API until granted. Without this the page renders a
-- silent empty list rather than an error.
grant usage on schema public to anon, authenticated;

-- WRITE grants here, unlike every other user-facing table in this schema.
--
-- credit_wallets and friends are select-only to `authenticated` on purpose: a
-- grant there plus an auth.uid() policy would let anyone mint credits from the
-- browser console with the anon key that ships in the web bundle. That reasoning
-- does not carry over. This table holds no balance, no entitlement and no role —
-- nothing a user could grant themselves by writing to it. The rows are the
-- user's own interview notes, they are edited from the dashboard as the
-- signed-in user, and the policies above scope every write to their own rows.
grant select, insert, update, delete on public.interview_profiles to authenticated;

-- The desktop never uses these grants: it has a licence key, not a Supabase
-- session, and reads through /api/profiles on the service role.
revoke all on public.interview_profiles from anon;

-- ============================================================ updated_at
create or replace function public.touch_interview_profile()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  -- Belt and braces with the update policy's `with check`: even a future
  -- service-role caller cannot silently re-owner a row through this path.
  new.user_id = old.user_id;
  return new;
end;
$$;

drop trigger if exists interview_profiles_touch on public.interview_profiles;
create trigger interview_profiles_touch
  before update on public.interview_profiles
  for each row execute function public.touch_interview_profile();

-- ============================================================ schema cache
-- PostgREST answers from a cached copy of the schema, so a table that exists in
-- the database is still invisible to the Data API until it reloads — the error
-- is literally "Could not find the table ... in the schema cache", which reads
-- like the migration failed when it actually succeeded.
--
-- Supabase reloads on its own via an event trigger, but not instantly, and not
-- at all when this file is pasted into the SQL editor by hand. Asking directly
-- costs nothing and removes the confusing window.
notify pgrst, 'reload schema';

-- ============================================================ 20260830010000_devices.sql
-- ═══════════════════════════════════════════════════════════════ devices ════
--
-- "Where is this account signed in, and sign it out."
--
-- Nothing tracked devices before this. `interview_sessions.device_id` records
-- which machine ran a given interview, but that is a fact about a session, not a
-- registry — it cannot answer "which machines is my licence active on right
-- now", and there is nothing to revoke.
--
-- Two kinds of device share one table because the dashboard shows them in one
-- list and "sign out everywhere" has to mean everywhere:
--
--   desktop  the Electron app, identified by the UUID it already generates and
--            stores locally (electron/main.cjs createDeviceId). It re-validates
--            its licence on launch and every 10 seconds, which is what makes
--            revocation take effect quickly.
--
--   web      a browser, identified by a random id in a first-party cookie we
--            set. Supabase has NO API to enumerate a user's active sessions, so
--            a browser that never told us about itself cannot be listed. This is
--            the only way to answer the question at all.
--
-- WHAT THIS DELIBERATELY DOES NOT STORE: no IP address and no geolocation. Every
-- other product's device list shows them, and it would be easy — but the privacy
-- policy does not currently say we keep either, and adding the column before
-- adding the disclosure is how a policy becomes untrue.

create table if not exists public.devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,

  -- Opaque, client-generated. For desktop this is the value already persisted in
  -- electron-store; for web it is the cookie we mint on first sight.
  device_id     text not null,

  kind          text not null check (kind in ('desktop', 'web')),

  -- What the dashboard prints: "macOS · Smart Hire 1.4.0", "Chrome on Windows".
  -- Built server-side, because a client-supplied label is a stored-XSS vector
  -- and, more mundanely, a client that lies makes the list useless.
  label         text,
  platform      text,
  app_version   text,

  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),

  -- Set, never cleared. See the note on re-registration below.
  revoked_at    timestamptz,

  -- One row per device per account. This is what makes the upsert on every
  -- licence check cheap and idempotent rather than appending a row per poll.
  unique (user_id, device_id)
);

create index if not exists devices_user_last_seen_idx
  on public.devices (user_id, last_seen_at desc);

-- Revoked desktops keep polling until the app notices and signs out, so the
-- sweep that lists "still calling in after revocation" wants this.
create index if not exists devices_revoked_idx
  on public.devices (user_id) where revoked_at is not null;

-- ───────────────────────────────────────────────────────────────────── RLS
--
-- SELECT only, matching the stance on the billing tables. Revocation runs
-- through the service-role client in an API route rather than a column grant,
-- because revoking a device also has to revoke the Supabase session that goes
-- with it — that is a two-step operation the database cannot do on its own, and
-- splitting it would let a client do half of it.
alter table public.devices enable row level security;

drop policy if exists "read own devices" on public.devices;
create policy "read own devices" on public.devices
  for select using (auth.uid() = user_id);

grant select on public.devices to authenticated;

-- Belt and braces, in the spirit of the credit-table grants: a stray
-- `grant update` here would let any signed-in user un-revoke a device they had
-- just been signed out of.
revoke insert, update, delete on public.devices from authenticated, anon;
revoke all on public.devices from anon;

-- ─────────────────────────────────────────────────── re-registration rule
--
-- A revoked device that keeps calling MUST stay revoked. The upsert in
-- lib/devices.js writes last_seen_at, label, platform and app_version and never
-- mentions revoked_at, so ON CONFLICT DO UPDATE leaves it alone — a revoked
-- machine bumping its timestamp stays revoked rather than quietly reactivating
-- itself on the next 10-second poll.
--
-- That is the whole reason rows are kept and flagged rather than deleted. If
-- revocation were a DELETE, the very next licence check would insert a fresh
-- active row and undo it.

-- ============================================================ 20260830020000_resume_files.sql
-- RESUME-UPLOAD 2026-08-30
--
-- A dropped PDF is now parsed into a structured, editable record, and THE
-- ORIGINAL FILE IS KEPT. That second half is the part worth reading twice.
--
-- Until today the most sensitive thing this table held was résumé text the
-- interviewer had pasted in themselves. Now it holds the candidate's actual
-- document, at rest, in our storage — belonging to a person who is not a user
-- of this product, did not create this account, and cannot delete their own
-- data from it. Everything below follows from that one fact:
--
--   * the bucket is private and has NO permissive write policy for any browser
--     role, so the only writer is the service-role parse route;
--   * the blanket `update` grant on this table is withdrawn and re-granted per
--     column, so the file pointer is not something a browser can forge or blank;
--   * changing the stored file resets resume_consent, because consent belongs
--     to a document and a new document has not been consented to;
--   * deleting a row queues the file for actual deletion, rather than leaving
--     unreachable bytes in a bucket forever.
--
-- WHAT THIS DOES NOT DO: it does not touch the enforcement point. The résumé
-- still reaches the model only through buildSystemPrompt() in
-- apps/desktop/src/services/systemPrompt.js, which still omits the RESUME
-- section entirely when the flag is false. Structured parsing changes how the
-- text is PRODUCED, never how it is GATED.

-- ============================================================ columns
alter table public.interview_profiles
  -- The parse output: one object per profile, replaced whole.
  --
  -- jsonb here rather than three child tables (education / job_experience /
  -- other_experience). There is exactly one record per profile, it is never
  -- queried across profiles, never joined and never filtered on, and it is
  -- always read and written whole. Three tables would mean three sets of RLS
  -- policies each re-deriving ownership through a join back to this one —
  -- tripling the surface 20260830000000 worked to keep at a single table, and
  -- join-based policies are the ones that get subtly wrong. Order is also
  -- semantic in a résumé; a JSON array preserves it without a position column.
  add column if not exists resume_parsed      jsonb,

  -- Storage pointer: 'resumes' bucket, path {user_id}/{profile_id}/{uuid}.pdf.
  -- Deliberately ABSENT from the column grants below — only the service-role
  -- parse route moves this.
  add column if not exists resume_file_path   text,
  -- The candidate's own filename, kept as DATA (something to display) rather
  -- than as an IDENTIFIER, which is why it is not in the storage path:
  -- "Priya_Sharma_Resume_2026.pdf" is itself PII and would otherwise appear in
  -- every access log and signed URL we ever mint.
  add column if not exists resume_file_name   text,
  add column if not exists resume_file_size   integer,
  add column if not exists resume_file_pages  smallint,

  add column if not exists resume_source      text not null default 'manual',
  add column if not exists resume_parsed_at   timestamptz,

  -- Brandfetch. The DOMAIN is stored and the logo URL is derived from it at
  -- render time, never stored: Brandfetch's search results carry icon URLs that
  -- expire after 24 hours and that their guidelines forbid caching. A stored URL
  -- would be a copy that rots; the domain is the durable identity.
  add column if not exists company_domain     text;

comment on column public.interview_profiles.resume_parsed is
  'Structured résumé: {personal, introduction, education[], jobs[], other[]}. Flattened into resume on save; shape lives in apps/web/lib/resume.js.';
comment on column public.interview_profiles.resume_file_path is
  'Object path in the private `resumes` bucket. First path segment is the owner and is what the storage policies key on.';

-- ============================================================ constraints
-- `add constraint if not exists` does not exist, so drop-then-add keeps this
-- migration re-runnable.
alter table public.interview_profiles
  drop constraint if exists interview_profiles_resume_source_check,
  drop constraint if exists interview_profiles_resume_parsed_object,
  drop constraint if exists interview_profiles_resume_parsed_size,
  drop constraint if exists interview_profiles_company_domain_shape;

alter table public.interview_profiles
  add constraint interview_profiles_resume_source_check
    check (resume_source in ('manual', 'pdf')),

  -- normalizeParsed() in apps/web/lib/resume.js is the real shape check. These
  -- two are the floor under it: whatever bug ships in that file, a row can never
  -- hold a bare string or a quarter-megabyte of model output. A résumé is
  -- attacker-supplied text going into a model, so "the model returned 5 MB of X"
  -- is a real case and not a hypothetical one.
  add constraint interview_profiles_resume_parsed_object
    check (resume_parsed is null or jsonb_typeof(resume_parsed) = 'object'),
  add constraint interview_profiles_resume_parsed_size
    check (resume_parsed is null or octet_length(resume_parsed::text) < 262144),

  add constraint interview_profiles_company_domain_shape
    check (company_domain is null
           or company_domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$');

-- Partial index: the orphan drain and the retention purge both ask "which rows
-- still point at a file", which is a small minority of rows.
create index if not exists interview_profiles_resume_file_idx
  on public.interview_profiles (updated_at)
  where resume_file_path is not null;

-- ============================================================ ledger kind
-- Parsing is charged a flat minute through credit_debit(), the same shape as
-- company research — and credit_ledger.kind is a closed CHECK list, so without
-- this the debit fails on the constraint. That failure surfaces through
-- chargeResumeParse()'s catch as "Could not check your balance", which reads as
-- a database wobble rather than as the migration being half-applied. Cheap to
-- add, genuinely confusing to debug.
alter table public.credit_ledger drop constraint if exists credit_ledger_kind_check;
alter table public.credit_ledger add constraint credit_ledger_kind_check check (kind in (
  'purchase', 'purchase_bonus', 'admin_grant', 'admin_adjustment',
  'signup_bonus', 'session_debit', 'research_debit', 'resume_parse_debit',
  'refund', 'reconcile'));

-- ============================================================ column grants
-- SECURITY: this narrows an existing blanket grant, and it is the change that
-- makes everything else in this file trustworthy.
--
-- 20260830000000 granted `update` on the whole table. That was defensible when
-- every column was the user's own free text. It is not defensible now: with a
-- blanket grant, any signed-in user can point resume_file_path at an arbitrary
-- string from the browser console, or blank it to strand a stored file — and the
-- consent-reset trigger below, which keys on that column changing, becomes
-- something the client drives rather than something that constrains it.
--
-- Same shape as the profiles fix in 20260829000100: the update policy authorises
-- the ROW; this grant authorises the COLUMN.
revoke insert, update on public.interview_profiles from authenticated, anon;

grant insert (
  user_id, candidate_name,
  company, company_domain,
  role, resume, resume_consent, resume_parsed, job_description
) on public.interview_profiles to authenticated;

-- user_id is absent here on purpose. It is already covered twice — the update
-- policy's `with check`, and the touch trigger's force-restore — and a third,
-- structural block costs nothing.
grant update (
  candidate_name,
  company, company_domain,
  role, resume, resume_consent, resume_parsed, job_description
) on public.interview_profiles to authenticated;

-- select and delete are unchanged and deliberately still granted. DELETE in
-- particular: a user must be able to remove a candidate's résumé from their
-- account even when our API route is down. That is a privacy right, not a
-- convenience — and the tombstone trigger below means a direct client delete
-- still gets the bytes reclaimed.

-- ============================================================ consent on replace
create or replace function public.touch_interview_profile()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  -- Belt and braces with the update policy's `with check`: even a future
  -- service-role caller cannot silently re-owner a row through this path.
  new.user_id = old.user_id;

  -- RESUME-UPLOAD 2026-08-30: CONSENT BELONGS TO A DOCUMENT, NOT TO A PROFILE.
  --
  -- InterviewProfiles.jsx already refuses to carry a tick across a cleared
  -- résumé, on the grounds that "the flag is meaningless without the text it
  -- governs". This is the same rule applied to the file: if the stored PDF
  -- changed, nobody has been asked about the NEW one, so the old answer is not
  -- an answer to the question being asked.
  --
  -- Keyed on resume_file_path and NOT on `resume`, deliberately. The pasted-text
  -- flow writes the text and the tick in a SINGLE update — the interviewer is
  -- looking at the textarea and the checkbox at the same moment — and clearing
  -- the flag there would make the box impossible to tick at all. The file path
  -- is different: it is not in the column grant above, so only the service-role
  -- parse route can move it, and that route never sets consent true.
  --
  -- This also clears consent when a file is REMOVED. That is intended: without
  -- the original, the interviewer can no longer check what they agreed to.
  if new.resume_file_path is distinct from old.resume_file_path then
    new.resume_consent = false;
  end if;

  return new;
end;
$$;

-- ============================================================ storage bucket
-- Private: a résumé is the most sensitive thing this product stores, and a
-- public bucket means a guessable URL is the only thing between it and the web.
--
-- The bucket's own limit (6 MiB) sits ABOVE the route's (4 MB). Two ceilings on
-- purpose: the route's is the one that speaks to the user, so it must be the
-- one that trips. If the bucket were tighter, an oversized file would surface as
-- a storage-service error string instead of our own sentence with the real size
-- in it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 6291456, array['application/pdf'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================ storage RLS
-- Supabase already enables RLS on storage.objects; this is idempotent and states
-- the assumption rather than relying on it.
alter table storage.objects enable row level security;

drop policy if exists "read own resume files"     on storage.objects;
drop policy if exists "resumes: no client insert" on storage.objects;
drop policy if exists "resumes: no client update" on storage.objects;
drop policy if exists "resumes: no client delete" on storage.objects;

-- SELECT is the ONLY permissive policy this bucket gets. It is what lets the
-- browser mint its own short-lived signed URL for the Original PDF tab, so no
-- extra route is needed to view a file.
--
-- The FIRST PATH SEGMENT is the owner — lib/storage.js builds every path as
-- `${userId}/${profileId}/${uuid}.pdf` — which makes this a pure string compare
-- with no join back to interview_profiles. A policy that joins is a policy that
-- can be wrong; this one cannot be.
--
-- (select auth.uid()) rather than the bare auth.uid() used elsewhere in this
-- schema: storage.objects is a large shared table, and the subquery form is
-- evaluated once as an InitPlan instead of once per candidate row.
create policy "read own resume files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- INSERT / UPDATE / DELETE get no permissive policy, so all three are already
-- denied to anon and authenticated. The three RESTRICTIVE policies below grant
-- nothing — restrictive policies are ANDed with every permissive policy on the
-- table, so a future permissive policy added from the Supabase dashboard (or
-- copy-pasted out of a storage quickstart) still cannot write here. They are
-- scoped by `bucket_id <> 'resumes'`, so every other bucket is unaffected.
--
-- service_role has BYPASSRLS, so the parse route is untouched by all of this.
--
-- Why writes are closed to the browser at all: an RLS policy sees bucket_id,
-- name and owner — never the bytes. allowed_mime_types is checked against the
-- CLIENT-DECLARED Content-Type, so a direct upload of a 4 MB ZIP labelled
-- application/pdf passes every control above. The route reads the first five
-- bytes and requires %PDF-, which is a check only a writer can perform.
create policy "resumes: no client insert"
  on storage.objects as restrictive for insert
  to authenticated, anon
  with check (bucket_id <> 'resumes');

create policy "resumes: no client update"
  on storage.objects as restrictive for update
  to authenticated, anon
  using      (bucket_id <> 'resumes')
  with check (bucket_id <> 'resumes');

create policy "resumes: no client delete"
  on storage.objects as restrictive for delete
  to authenticated, anon
  using (bucket_id <> 'resumes');

-- Deliberately NO `revoke` on storage.objects. Supabase grants CRUD there to
-- authenticated/anon by design and RLS is the control; revoking would break
-- every other bucket, present and future.

-- ============================================================ storage_orphans
-- Files whose owning row is gone, or has moved on to a different file.
--
-- WHY A TABLE AND NOT A TRIGGER THAT JUST DELETES: a Postgres trigger cannot
-- delete a stored file. storage.objects is an ordinary table, so a trigger CAN
-- delete the metadata row — and the blob then stays in the bucket, permanently
-- unreachable and attributable to nobody. Never delete storage.objects rows
-- from SQL. The database records the debt instead; a service-role caller with
-- the storage API pays it.
create table if not exists public.storage_orphans (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text not null,
  object_path text not null,
  user_id     uuid,
  reason      text not null,
  created_at  timestamptz not null default now(),
  swept_at    timestamptz
);

create index if not exists storage_orphans_pending_idx
  on public.storage_orphans (created_at) where swept_at is null;

-- No grants at all. Nothing in a browser reads or writes this.
alter table public.storage_orphans enable row level security;
revoke all on public.storage_orphans from anon, authenticated;

create or replace function public.tombstone_resume_file()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- SECURITY DEFINER is required here, not stylistic: on a client-issued DELETE
  -- this trigger runs as `authenticated`, which has no grants on storage_orphans
  -- and would fail the insert — silently losing the file instead of queueing it.
  if tg_op = 'DELETE' then
    if old.resume_file_path is not null then
      insert into public.storage_orphans (bucket_id, object_path, user_id, reason)
      values ('resumes', old.resume_file_path, old.user_id, 'profile_deleted');
    end if;
    return old;
  end if;

  if old.resume_file_path is not null
     and new.resume_file_path is distinct from old.resume_file_path then
    insert into public.storage_orphans (bucket_id, object_path, user_id, reason)
    values ('resumes', old.resume_file_path, old.user_id, 'file_replaced');
  end if;
  return new;
end;
$$;

drop trigger if exists interview_profiles_tombstone_resume on public.interview_profiles;
create trigger interview_profiles_tombstone_resume
  after update or delete on public.interview_profiles
  for each row execute function public.tombstone_resume_file();

-- The net effect is that NO deletion path leaves a candidate's PDF behind:
-- the browser's existing direct .delete(), our own API route, and the cascade
-- from profiles all pass through this trigger.

-- ============================================================ retention
-- Holding a non-user's document indefinitely because an interviewer once
-- dropped it in is not a position worth defending. The structured record and
-- the consent flag survive — the interviewer keeps their notes — and only the
-- original file goes. Nulling the pointer fires the tombstone trigger above, so
-- the bytes queue for removal on their own.
create or replace function public.purge_expired_resume_files(p_days integer default 180)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare v_count integer;
begin
  with expired as (
    update public.interview_profiles
       set resume_file_path = null,
           resume_file_name = null
     where resume_file_path is not null
       and updated_at < now() - make_interval(days => p_days)
    returning 1
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

-- ============================================================ function grants
-- Postgres grants EXECUTE to PUBLIC by default and PUBLIC includes
-- `authenticated`; `public` is an exposed schema, so without this every function
-- here is reachable at POST /rest/v1/rpc/<name> from any browser holding the
-- anon key. Signatures must match EXACTLY — a revoke against a stale signature
-- silently does nothing.
--
-- tombstone_resume_file and touch_interview_profile are NOT in this list: they
-- are trigger functions, reached only through their triggers, and revoking
-- EXECUTE on a trigger function does not affect trigger firing.
do $$
declare f text;
begin
  foreach f in array array[
    'public.purge_expired_resume_files(integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ============================================================ schema cache
-- New columns, same failure as a new table: PostgREST answers from a cached copy
-- of the schema, so a save fails with "Could not find the 'resume_parsed' column
-- of 'interview_profiles' in the schema cache" — which reads like the migration
-- failed when it actually succeeded.
notify pgrst, 'reload schema';

-- ============================================================ 20260830030000_session_billing_clamp.sql
-- ═════════════════════════════════════════════════ session billing clamp ════
--
-- Nobody is billed for silence.
--
-- THE HOLE
--
-- session_settle() charges greatest(1, ceil((p_bill_until - started_at)/60)),
-- and its callers disagree about what p_bill_until should be:
--
--   sweep_stale_sessions()  last_heartbeat_at  — the time the client REPORTED
--   session_heartbeat()     now()
--   session_stop()          now()
--
-- The sweep's header promises "a laptop that slept for four hours is charged
-- for the time it actually reported". That promise was kept only by luck,
-- because the sweep has no cron — it rides along on license_snapshot() and
-- session_start(), and a sleeping or closed machine calls neither. On wake,
-- Chromium fires the overdue setInterval and the desktop's 10-second licence
-- poll at the same moment, and whichever won decided whether the user paid
-- three minutes or three hours.
--
-- The quit path had it worse and without the race: electron/main.cjs closes a
-- session on will-quit, so a window closed at 09:00 and quit at 12:00 posted a
-- stop that billed three hours. credit_debit() drains to zero rather than
-- refusing the whole charge, so the loss was capped at the user's entire
-- balance — and it landed labelled "Ended by you".
--
-- THE RULE
--
-- Past the stale window, this call IS a sweep, whoever made it. Clamp the time
-- to what the client last reported and close the row.
--
-- Closing is what makes the clamp safe. Clamping WITHOUT closing would be an
-- exploit: a client beating every 200 seconds would advance the meter by 90
-- seconds per 200 and run indefinitely at under half price. Because the row
-- closes, the only way to continue is a new session — which costs a fresh
-- minute. And the forgiven window is time no AI could have been used in:
-- lib/ai.js heartbeats on every /api/ai/* call, so any request inside it would
-- have moved last_heartbeat_at forward itself.
--
-- A caller that passed its own reason keeps it — a genuine client_stop arriving
-- late is still "Ended by you", it just does not bill the gap. Only the
-- reasonless heartbeat path falls through to 'stale'.
--
-- WHY 90 IS A LITERAL
--
-- It mirrors STALE_SECONDS in apps/web/lib/metering.js. Adding a
-- p_stale_seconds parameter instead would create a SECOND signature, and the
-- revoke/grant block in 20260829120000_credit_billing.sql revokes the old one
-- by exact signature — a revoke against a stale signature silently does
-- nothing and leaves the function callable by any signed-in browser holding
-- the anon key. That is exactly how role escalation re-opened between bd5df64
-- and c548a01. The signature does not change here.

create or replace function public.session_settle(
  p_session_id uuid,
  p_bill_until timestamptz,
  p_close      boolean,
  p_reason     text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s        record;
  v_due    integer;
  v_need   integer;
  v_got    integer := 0;
  v_stop   boolean := false;
  v_reason text    := p_reason;
  v_bal    integer;
begin
  -- Lock order is ALWAYS interview_sessions then credit_wallets, in every
  -- function here, so deadlock is impossible.
  select * into s from public.interview_sessions where id = p_session_id for update;
  if not found then
    return json_build_object('ok', false, 'code', 'no_session', 'reason', 'Session not found');
  end if;

  select coalesce(minutes_balance, 0) into v_bal
    from public.credit_wallets where user_id = s.user_id;

  if s.ended_at is not null then
    return json_build_object(
      'ok', true, 'sessionId', s.id, 'userId', s.user_id,
      'stop', true, 'reason', s.end_reason, 'metered', s.metered,
      'minutesRemaining', coalesce(v_bal, 0),
      'minutesElapsed',   s.minutes_elapsed,
      'minutesCharged',   s.minutes_charged,
      'elapsedSeconds',   floor(extract(epoch from (s.ended_at - s.started_at)))::int);
  end if;

  -- BILL-UNTIL CLAMP 2026-08-30: see the header. Placed after the early return
  -- above, so ended_at is null is already implied.
  --
  -- Against every caller: session_start's first settle passes now() on a row
  -- whose last_heartbeat_at defaults to now(), so it never fires. A 20-second
  -- heartbeat never fires it. A post-sleep heartbeat closes as 'stale' billed to
  -- the last beat. A late session_stop keeps 'client_stop' and bills honestly.
  -- The supersede branch runs immediately after the sweep, so anything still
  -- open beat inside the window. And sweep_stale_sessions passes exactly these
  -- three values already, which makes this an idempotent no-op for it.
  if s.last_heartbeat_at < now() - interval '90 seconds' then
    p_bill_until := s.last_heartbeat_at;
    p_close      := true;
    v_reason     := coalesce(v_reason, 'stale');
  end if;

  v_due  := greatest(1, ceil(extract(epoch from (p_bill_until - s.started_at)) / 60.0))::integer;
  v_need := v_due - s.minutes_elapsed;

  if v_need > 0 then
    if s.metered then
      v_got := public.credit_debit(s.user_id, s.id, v_need, 'session_debit');
      if v_got < v_need then
        v_stop   := true;
        v_reason := 'out_of_credits';
      end if;
    else
      -- Unlimited: the meter advances, the wallet does not move.
      v_got := v_need;
    end if;
  end if;

  update public.interview_sessions
     set minutes_elapsed   = minutes_elapsed + v_got,
         minutes_charged   = minutes_charged + case when s.metered then v_got else 0 end,
         -- greatest() so the sweep (which passes last_heartbeat_at) cannot
         -- rewind the clock, while a heartbeat always advances it.
         last_heartbeat_at = greatest(last_heartbeat_at, p_bill_until),
         ended_at   = case when p_close or v_stop then now() else null end,
         end_reason = case when p_close or v_stop then coalesce(v_reason, 'client_stop') else null end
   where id = s.id;

  select coalesce(minutes_balance, 0) into v_bal
    from public.credit_wallets where user_id = s.user_id;

  return json_build_object(
    'ok', true,
    'sessionId', s.id,
    'userId',    s.user_id,
    'metered',   s.metered,
    'stop',      (p_close or v_stop),
    'reason',    case when (p_close or v_stop) then coalesce(v_reason, 'client_stop') else null end,
    'minutesRemaining', coalesce(v_bal, 0),
    'minutesElapsed',   s.minutes_elapsed + v_got,
    'minutesCharged',   s.minutes_charged + case when s.metered then v_got else 0 end,
    'elapsedSeconds',   floor(extract(epoch from (p_bill_until - s.started_at)))::int);
end $$;

-- ============================================================ function grants
-- CREATE OR REPLACE preserves the existing ACL, so the revoke in
-- 20260829120000_credit_billing.sql still stands. Re-issued anyway: the cost is
-- nothing and the failure mode of assuming otherwise is a world-callable
-- billing function. The signature below must stay byte-identical to the one in
-- that file's revoke array.
revoke all on function public.session_settle(uuid,timestamptz,boolean,text)
  from public, anon, authenticated;
grant execute on function public.session_settle(uuid,timestamptz,boolean,text)
  to service_role;

notify pgrst, 'reload schema';

notify pgrst, 'reload schema';
