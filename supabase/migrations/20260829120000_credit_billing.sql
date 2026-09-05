-- Replaces the monthly/yearly/lifetime licence model with two products:
--
--   CREDITS       1 credit = 60 minutes of live interview time, metered per
--                 minute. The remainder persists in the account and never
--                 expires: buy an hour, use 30 minutes, and 30 minutes are
--                 still there tomorrow.
--
--   SUBSCRIPTION  Weekly, monthly or yearly. Unlimited call time — a subscriber
--                 is not metered at all while their period is live.
--
-- MINUTES are canonical everywhere: the database, the API and the desktop app
-- all deal in whole integers. "Credits" is a presentation unit and lives only in
-- apps/dashboard/lib/credits.js. That is what keeps rounding out of the metering path
-- — someone who buys 3 credits owns exactly 180 minutes.
--
-- Both are sold on the public site. An admin can also grant either by hand, for
-- discounts, comps and support fixes.

-- ============================================================ licenses
-- A licence is now purely an activation credential: key -> user, active or
-- revoked. What the account may DO lives on the wallet, so a user holding two
-- keys shares one balance and one subscription.
--
-- Dropping `plan` also removes a live trap: lib/license.js's getExpiryDate()
-- returned the CURRENT timestamp for any plan value it did not recognise, and
-- validateLicense then wrote status='expired' on the very next call,
-- milliseconds later.

-- The inline CHECK in 00000000000000_init.sql is auto-named licenses_plan_check,
-- but drop whatever it is actually called on the live database rather than
-- trusting that name.
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class     rel on rel.oid = con.conrelid
      join pg_namespace ns  on ns.oid  = rel.relnamespace
     where ns.nspname  = 'public'
       and rel.relname = 'licenses'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%lifetime%'
  loop
    execute format('alter table public.licenses drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.licenses
  drop column if exists plan,
  drop column if exists expires_at,
  drop column if exists stripe_subscription_id,
  drop column if exists stripe_customer_id;

-- 'expired' is gone with expires_at. Anything already marked expired becomes
-- revoked so the narrowed CHECK can be applied.
update public.licenses set status = 'revoked' where status not in ('active', 'revoked');

do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class     rel on rel.oid = con.conrelid
      join pg_namespace ns  on ns.oid  = rel.relnamespace
     where ns.nspname  = 'public'
       and rel.relname = 'licenses'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%revoked%'
  loop
    execute format('alter table public.licenses drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.licenses
  add constraint licenses_status_check check (status in ('active', 'revoked'));

comment on table public.licenses is
  'Activation credential only: key -> user, active or revoked. Entitlement '
  '(credit balance and subscription) lives on public.credit_wallets, which '
  'belongs to the account rather than to any one key.';

-- ============================================================ new tables
-- NOTE: plain `create table`, NOT `create table if not exists`, and every name
-- is prefixed. This Supabase project is SHARED with another product, and
-- `sessions` / `credits` / `orders` / `subscriptions` are exactly the names it
-- is likely to own already. `if not exists` against someone else's table
-- silently succeeds and does nothing, after which the functions below would
-- read and write a stranger's data. Failing loudly here is the point — please
-- do not "tidy" this back to `if not exists`.

-- ------------------------------------------------------------ credit_wallets
-- One row per account: the credit balance AND the subscription state.
--
-- Deliberately NOT columns on public.profiles. The privilege-escalation
-- regression fixed in c548a01 was a lost `revoke update on public.profiles`, and
-- if that ever recurs the damage should be role escalation only — never free
-- credits, and never a free unlimited subscription. profiles is also on the
-- hottest read path, and a debit every minute would churn dead tuples there.
--
-- Nothing in this table is writable by `authenticated` at any privilege level;
-- see the grants block. Every change goes through the functions below, which are
-- service-role only.
create table public.credit_wallets (
  user_id             uuid primary key references public.profiles(id) on delete cascade,

  -- Bought or granted. Never expires. Spent a minute at a time.
  minutes_balance     integer not null default 0 check (minutes_balance >= 0),
  minutes_spent_total integer not null default 0 check (minutes_spent_total >= 0),

  -- An active subscription means UNLIMITED: sessions are not metered and the
  -- balance is not touched. Credits keep their value underneath and start being
  -- spent again the moment the subscription lapses, which is why cancelling
  -- never destroys minutes someone paid for.
  subscription_kind        text check (subscription_kind in ('weekly', 'monthly', 'yearly')),
  subscription_status      text check (subscription_status in ('active', 'past_due', 'canceled')),
  subscription_period_end  timestamptz,
  stripe_customer_id       text,
  stripe_subscription_id   text unique,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- A subscription is all-or-nothing: kind, status and period end travel
  -- together, so "unlimited" can never be half-set.
  constraint credit_wallets_subscription_complete check (
    (subscription_kind is null and subscription_status is null and subscription_period_end is null) or
    (subscription_kind is not null and subscription_status is not null and subscription_period_end is not null)
  )
);

create index credit_wallets_stripe_customer_idx
  on public.credit_wallets (stripe_customer_id) where stripe_customer_id is not null;

-- ------------------------------------------------------------ interview_sessions
-- Anchors per-minute metering. One row per live session.
create table public.interview_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  license_id        uuid references public.licenses(id) on delete set null,

  -- FROZEN at session_start from the wallet's subscription state, and never
  -- re-derived. A subscription that lapses mid-session does not start charging
  -- someone halfway through an interview, and one that starts mid-session does
  -- not retroactively refund. The change takes effect on the next session,
  -- which is the only behaviour that is not surprising.
  metered           boolean not null default true,

  started_at        timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at          timestamptz,

  -- minutes_elapsed is the METER POSITION: whole minutes this session has
  -- reached, and the idempotency key — a replayed heartbeat computes the same
  -- figure and does nothing. It advances for subscribers too, which is what
  -- makes "how much did we actually serve them" answerable.
  --
  -- minutes_charged is the MONEY: what came out of the wallet. Zero for a
  -- subscriber. They diverge there, and again when a balance runs out mid-minute.
  minutes_elapsed   integer not null default 0 check (minutes_elapsed >= 0),
  minutes_charged   integer not null default 0 check (minutes_charged >= 0),

  -- The meter caps exposure to TIME. Nothing caps request volume, and under an
  -- unlimited subscription nothing caps time either — so this is the only thing
  -- standing between a scripted licence key and an uncapped OpenAI bill.
  ai_requests       integer not null default 0 check (ai_requests >= 0),

  end_reason        text check (end_reason in (
                      'client_stop', 'out_of_credits', 'stale', 'superseded',
                      'license_revoked', 'request_limit', 'admin_stop')),
  device_id         text,
  app_version       text,

  -- "x is null" never yields NULL, so this comparison is always decidable.
  constraint interview_sessions_end_reason_requires_end
    check ((ended_at is null) = (end_reason is null))
);

-- At most one open session per account. This is the anti-double-spend guarantee
-- at its strongest, and it hands the product the seat limit it has never had,
-- for free — including for subscribers, where it is the only thing stopping one
-- "unlimited" licence key being shared across an office.
--
-- session_start() settles and closes any existing open session before opening a
-- new one, so this never blocks a legitimate restart after a crash.
create unique index interview_sessions_one_open_per_user
  on public.interview_sessions (user_id) where ended_at is null;

create index interview_sessions_sweep_idx
  on public.interview_sessions (last_heartbeat_at) where ended_at is null;

create index interview_sessions_user_started_idx
  on public.interview_sessions (user_id, started_at desc);

-- ------------------------------------------------------------ credit_orders
-- One row per checkout, for credit packs and for subscriptions alike.
create table public.credit_orders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,

  kind         text not null default 'credits' check (kind in ('credits', 'subscription')),
  pack_id      text not null,

  -- What the customer PAYS for and what they RECEIVE differ on the bonus packs:
  -- "6 credits +2 free" is credits 6, bonus_credits 2, eight hours delivered.
  -- Both are stored so a receipt can be reconstructed exactly.
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

create index credit_orders_user_idx on public.credit_orders (user_id, created_at desc);

-- ------------------------------------------------------------ credit_ledger
-- Append-only in spirit: grant rows are never touched again, and a session's row
-- is accumulated in place only while that session is live.
--
-- ONE ROW PER SESSION, not one per minute. A row per minute is 60/hour/session —
-- roughly 17.5M rows a year at 100 users, which exceeds the Supabase free tier
-- in about two months. Idempotency lives in interview_sessions.minutes_elapsed
-- (a column), so the ledger keeps identical audit fidelity at one row.
--
-- Invariant: sum(minutes) per user = credit_wallets.minutes_balance.
-- public.credit_drift below is the check.
create table public.credit_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,

  minutes       integer not null,      -- positive = grant, negative = debit
  balance_after integer not null check (balance_after >= 0),

  kind          text not null check (kind in (
                  'purchase',          -- a paid credit pack
                  'purchase_bonus',    -- the "+2 free" half of a bonus pack
                  'admin_grant',       -- manual fulfilment / special discount
                  'admin_adjustment',  -- correction, may be negative
                  'signup_bonus',      -- the 10-minute demo
                  'session_debit',     -- live session time
                  'research_debit',    -- one-shot company research at setup
                  'refund',
                  'reconcile')),

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

create index credit_ledger_user_idx    on public.credit_ledger (user_id, created_at desc);
create index credit_ledger_created_idx on public.credit_ledger (created_at desc);

-- ------------------------------------------------------------ usage
-- Telemetry: one row per AI call. NOT the billing record — money moves only
-- through credit_ledger.
alter table public.usage
  add column if not exists session_id uuid references public.interview_sessions(id) on delete set null;

-- app/dashboard/usage/page.jsx filters by user_id and orders by created_at desc
-- against a table indexed on user_id alone, so that is a sort on every load.
create index if not exists usage_user_created_idx on public.usage (user_id, created_at desc);

-- ============================================================ drift check
-- The wallet is a denormalised running total; the ledger is the source of truth.
-- If these ever disagree, a write escaped the functions below.
create or replace view public.credit_drift as
select w.user_id,
       w.minutes_balance            as wallet_total,
       coalesce(sum(l.minutes), 0)  as ledger_total
  from public.credit_wallets w
  left join public.credit_ledger l on l.user_id = w.user_id
 group by w.user_id, w.minutes_balance
having w.minutes_balance <> coalesce(sum(l.minutes), 0);

-- ============================================================ RLS
alter table public.credit_wallets     enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.credit_orders      enable row level security;
alter table public.credit_ledger      enable row level security;

drop policy if exists "read own wallet"   on public.credit_wallets;
drop policy if exists "read own sessions" on public.interview_sessions;
drop policy if exists "read own orders"   on public.credit_orders;
drop policy if exists "read own ledger"   on public.credit_ledger;

create policy "read own wallet"   on public.credit_wallets     for select using (auth.uid() = user_id);
create policy "read own sessions" on public.interview_sessions for select using (auth.uid() = user_id);
create policy "read own orders"   on public.credit_orders      for select using (auth.uid() = user_id);
create policy "read own ledger"   on public.credit_ledger      for select using (auth.uid() = user_id);

-- ============================================================ grants
-- supabase/config.toml has auto_expose_new_tables commented out, so these tables
-- are invisible to the Data API until stated explicitly. Without this the
-- dashboard renders a silent zero rather than an error.
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.licenses, public.usage to authenticated;
grant select on public.credit_wallets, public.interview_sessions,
                public.credit_orders,  public.credit_ledger to authenticated;

-- SELECT ONLY, and this is not a formality. A `grant update` on credit_wallets
-- plus the auth.uid() policy above would let any signed-in user mint credits —
-- or hand themselves an unlimited subscription — from the browser console with
-- the public anon key, which ships in the web bundle.
revoke insert, update, delete on public.credit_wallets, public.interview_sessions,
                                 public.credit_orders,  public.credit_ledger
  from anon, authenticated;
revoke all on public.credit_wallets, public.interview_sessions,
              public.credit_orders,  public.credit_ledger
  from anon;

-- Restated verbatim from 20260829000100 so this file is safe to run against a
-- database in any state, and so nobody reads the new grants above as a
-- relaxation of this one. The column-level grant is the only thing stopping a
-- signed-in user promoting themselves with update({ role: 'admin' }).
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

-- ============================================================ backfill
-- Every existing profile gets a wallet and the same 10-minute demo, so no
-- account is left without a balance row.
insert into public.credit_wallets (user_id, minutes_balance)
select id, 10 from public.profiles
on conflict (user_id) do nothing;

insert into public.credit_ledger (user_id, minutes, balance_after, kind, note)
select w.user_id, 10, 10, 'signup_bonus', '10-minute demo (backfilled)'
  from public.credit_wallets w
 where not exists (
   select 1 from public.credit_ledger l where l.user_id = w.user_id
 );

notify pgrst, 'reload schema';
