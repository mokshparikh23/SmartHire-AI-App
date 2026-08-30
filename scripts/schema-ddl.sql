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
