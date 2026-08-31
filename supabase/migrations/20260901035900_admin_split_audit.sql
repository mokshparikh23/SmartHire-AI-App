-- ADMIN SPLIT 2026-09-01
--
-- Three things, all of them consequences of /admin moving to its own origin and
-- its own deployment (apps/admin), and getting a security pass on the way out.
--
--   1. subscription_events   the audit trail p_actor_id was declared for in
--                            20260829120000 and has never been written to.
--   2. subscription_set      rewritten to write that row. SIGNATURE UNCHANGED,
--                            so lib/metering.js does not move. The two payment
--                            webhooks each gain ONE argument on their cancel
--                            call — see the note on subscription_events.source
--                            for why that is required rather than tidy.
--   3. role safety           profile_set_role(), plus triggers that make
--                            "zero admins" unreachable from any writer at all —
--                            including the account-deletion cascade.
--
-- WHY THIS IS ITS OWN MIGRATION AND NOT AN EDIT. 20260830050000_razorpay.sql
-- says it outright: "a migration that has already run somewhere is not a file
-- you get to change." Both places that declare p_actor_id and drop it on the
-- floor stay exactly as they are.
--
-- ORDER-INDEPENDENT ON PURPOSE. Everything below is `create table if not
-- exists` / `drop … if exists` + `create` / `create or replace`, with no ALTER
-- that assumes a prior state. This tree gets edited in parallel and a sibling
-- migration landing either side of this one must produce the same database.
-- (20260901010000_account_deletion.sql appeared while this was being written,
-- which is exactly the scenario.)


-- ======================================================== subscription_events
-- One row per subscription write, renewals included.
--
-- NOT a mirror of credit_wallets. That table holds the CURRENT state; this holds
-- the HISTORY, and they answer different questions — "is this account unlimited
-- right now" versus "who gave it to them, and when".
--
-- WHY NOT credit_ledger, which already has an actor_id and would have been free.
-- Three reasons, any one of them sufficient. Its `kind` check constraint has no
-- subscription member. Its rows carry `check (balance_after >= 0)`, which a
-- subscription has no value for. And its documented invariant is that
-- `sum(minutes) per user` reconciles against `credit_wallets.minutes_balance` —
-- a subscription moves no minutes, so zero-minute rows would pollute the one
-- table whose whole job is that reconciliation.
create table if not exists public.subscription_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,

  -- The state AFTER the write. A null kind means the subscription was cleared.
  kind        text,
  status      text,
  period_end  timestamptz,

  -- WHO. Null means no human did it — a gateway webhook, or a system sweep.
  -- This is the column the whole migration exists for.
  actor_id    uuid references public.profiles(id) on delete set null,

  -- DERIVED INSIDE THE FUNCTION, not passed in. A p_source parameter would mean
  -- changing the signature, and a signature change is the one thing the razorpay
  -- migration's long note says to avoid — see the block above subscription_set.
  -- An actor id is only ever set by app/api/admin/subscription, so its presence
  -- IS the admin signal; otherwise the gateway ids on the call say which
  -- gateway it was.
  --
  -- THE CANCEL PATH ONLY WORKS BECAUSE THE TWO WEBHOOKS WERE CHANGED WITH THIS
  -- MIGRATION. Both used to cancel with a bare
  --     setSubscription({ userId, kind: null })
  -- carrying no actor and no gateway id, so every genuine gateway cancellation
  -- would have derived as 'system' — indistinguishable from a sweep, and the
  -- one event an audit trail most needs to attribute. They now pass their
  -- customer id on that path too (a no-op for the wallet, since the column is
  -- coalesced onto its own value). If a future caller cancels without one, this
  -- lands as 'system' again and the column quietly starts lying.
  --
  -- 'system' is left in the constraint for the genuinely unattributed case: a
  -- sweep, or a manual psql call.
  source      text not null check (source in ('admin', 'stripe', 'razorpay', 'system')),

  created_at  timestamptz not null default now()
);

create index if not exists subscription_events_user_idx
  on public.subscription_events (user_id, created_at desc);

create index if not exists subscription_events_actor_idx
  on public.subscription_events (actor_id, created_at desc)
  where actor_id is not null;

-- The storage_orphans / billing_archive idiom: RLS on, ZERO policies, grants
-- revoked. service_role bypasses RLS, so apps/admin reads this and nobody else
-- can — not even the subject of the row. An audit log its subject can read is
-- one they can shop for.
--
-- SELECT and INSERT only. The function below writes; apps/admin reads. Nothing
-- updates or deletes an audit row, so nothing is granted the ability to.
alter table public.subscription_events enable row level security;
revoke all on public.subscription_events from anon, authenticated;
grant select, insert on public.subscription_events to service_role;

comment on table public.subscription_events is
  'Append-only history of every subscription write. actor_id is the admin who '
  'did it, or null for a gateway webhook. Read by apps/admin only - RLS is on '
  'with no policies, so service_role is the only reader.';


-- ============================================================ subscription_set
-- CREATE OR REPLACE, AND DELIBERATELY NOT A DROP.
--
-- 20260830050000_razorpay.sql:93 does `drop function … (uuid,text,text,
-- timestamptz,text,text,uuid)` — the SEVEN-argument signature — and its long
-- note explains why: that migration CHANGED the signature to nine arguments, so
-- `create or replace` would have left the old one standing beside the new one.
-- An orphaned overload is a real security hole (PostgREST resolves by named
-- arguments, so calls go ambiguous; and the new function is named in no revoke
-- block, so it keeps Postgres's default EXECUTE grant to PUBLIC — a
-- "give myself an unlimited subscription" endpoint for anyone holding the anon
-- key, which ships in the web bundle).
--
-- None of that applies here, because THIS migration does not change the
-- signature. The nine arguments below are byte-identical to the ones in place;
-- only the body changes. `create or replace` therefore replaces rather than
-- overloads, and it PRESERVES the existing grants — where a drop would revoke
-- them and open a window, mid-migration, in which both payment webhooks 500
-- because the function they call does not exist.
--
-- THE SIGNATURE BELOW IS FROZEN. Changing any argument type or order turns this
-- statement from a replace into an overload, silently. If it ever has to change,
-- copy what the razorpay migration did: drop the old signature explicitly by
-- name, and re-run the revoke/grant block against the new one.
--
-- The revoke/grant block at the foot of this file is a no-op after a successful
-- replace. It stays anyway: it is the check that catches exactly the drift above.
-- Verify with `\df+ public.subscription_set` — one nine-argument function, and
-- the access privileges column reads service_role only.
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
declare
  v_kind   text;
  v_status text;
  v_end    timestamptz;
  v_source text;
begin
  if p_kind is not null and p_kind not in ('weekly', 'monthly', 'yearly') then
    return json_build_object('ok', false, 'code', 'bad_kind', 'reason', 'Unknown subscription kind');
  end if;
  if p_kind is not null and (p_status is null or p_period_end is null) then
    return json_build_object('ok', false, 'code', 'bad_shape',
                             'reason', 'A subscription needs a status and a period end');
  end if;

  -- ADMIN SPLIT 2026-09-01: an actor id that does not resolve to a profile is a
  -- caller bug. Letting the new FK raise below would abort a subscription write
  -- that is otherwise entirely correct, so fail before touching the wallet
  -- rather than after — and fail in the {ok,code,reason} shape every other
  -- guard in this function already uses.
  if p_actor_id is not null
     and not exists (select 1 from public.profiles where id = p_actor_id) then
    return json_build_object('ok', false, 'code', 'bad_actor', 'reason', 'Unknown actor');
  end if;

  insert into public.credit_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;

  -- Hoisted into variables so the wallet update, the audit row and the return
  -- value cannot disagree about what was written. The three `case when p_kind is
  -- null` expressions were previously repeated inline.
  v_kind   := p_kind;
  v_status := case when p_kind is null then null else p_status end;
  v_end    := case when p_kind is null then null else p_period_end end;

  update public.credit_wallets
     set subscription_kind       = v_kind,
         subscription_status     = v_status,
         subscription_period_end = v_end,
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

  -- ADMIN SPLIT 2026-09-01: the audit row, written INSIDE the function rather
  -- than by the calling route. That is deliberate — the admin route, the Stripe
  -- webhook and the Razorpay webhook are then all covered by construction, and a
  -- fourth caller added later cannot forget to write one.
  v_source := case
                when p_actor_id is not null then 'admin'
                when p_razorpay_customer is not null
                  or p_razorpay_subscription is not null then 'razorpay'
                when p_stripe_customer is not null
                  or p_stripe_subscription is not null then 'stripe'
                else 'system'
              end;

  insert into public.subscription_events
    (user_id, kind, status, period_end, actor_id, source)
  values
    (p_user_id, v_kind, v_status, v_end, p_actor_id, v_source);

  return json_build_object('ok', true,
    'subscriptionKind',   v_kind,
    'subscriptionStatus', v_status,
    'periodEnd',          v_end,
    'unlimited',          public.wallet_is_unlimited(p_user_id));
end $$;


-- ============================================================ profile_set_role
-- The ONLY way a role changes from application code, from here on.
--
-- app/api/admin/users/role used to run
--     admin.from('profiles').update({ role }).eq('id', userId)
-- with the service-role client — which bypasses RLS — and had no guard of any
-- kind. The page it is called from renders "Remove admin" on every row,
-- INCLUDING THE CALLER'S OWN. One click and one confirm() and a sole admin has
-- locked every admin out of the product, recoverable only from the SQL editor.
--
-- Two distinct rules, and they need two distinct homes:
--
--   self-demotion   needs to know WHO is acting. auth.uid() is null under
--                   service_role, so only a function that is TOLD the actor can
--                   enforce it. That is here.
--   last admin      must hold against every writer, including a future route, a
--                   script, or a dashboard copy-paste. That is the trigger
--                   below, not here — this only produces the nicer message.
create or replace function public.profile_set_role(
  p_user_id  uuid,
  p_role     text,
  p_actor_id uuid
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old    text;
  v_others integer;
begin
  if p_role not in ('user', 'admin') then
    return json_build_object('ok', false, 'code', 'bad_role', 'reason', 'Unknown role');
  end if;

  -- Serialize concurrent role changes. Without this the guard below is a
  -- read-then-write race, and it is not a theoretical one: two admins demoting
  -- each other during the same incident each read the other as still an admin,
  -- both writes succeed, and the system ends with zero admins. Transaction
  -- scoped, so it is released on commit or rollback with no unlock path to get
  -- wrong.
  perform pg_advisory_xact_lock(hashtext('public.profiles.role'));

  select role into v_old from public.profiles where id = p_user_id for update;
  if v_old is null then
    return json_build_object('ok', false, 'code', 'no_user', 'reason', 'No such user');
  end if;
  if v_old = p_role then
    return json_build_object('ok', true, 'role', p_role, 'changed', false);
  end if;

  -- FORBIDDEN OUTRIGHT, even when other admins exist. There is no in-product
  -- reason to remove your own admin: another admin can do it for you, and a sole
  -- admin handing over promotes their successor first and is then demoted BY
  -- them. Allowing it buys nothing, and it is the exact click that produced this
  -- migration.
  if p_actor_id = p_user_id and v_old = 'admin' and p_role <> 'admin' then
    return json_build_object('ok', false, 'code', 'self_demote',
      'reason', 'You cannot remove your own admin access. Ask another admin to do it.');
  end if;

  if v_old = 'admin' and p_role <> 'admin' then
    select count(*) into v_others
      from public.profiles where role = 'admin' and id <> p_user_id;
    if v_others = 0 then
      return json_build_object('ok', false, 'code', 'last_admin',
        'reason', 'This is the only admin account. Promote someone else first.');
    end if;
  end if;

  update public.profiles set role = p_role where id = p_user_id;

  return json_build_object('ok', true, 'role', p_role, 'changed', true,
                           'previousRole', v_old);
end $$;


-- ------------------------------------------------- the invariant, in the DB
-- profile_set_role() above produces the readable message. THIS is the guard.
--
-- It fires on any UPDATE from any client — the service-role client, a future
-- route that reaches for .update({ role }) again, a psql session, the Supabase
-- dashboard. That is the whole reason it exists rather than living only in JS.
--
-- SCOPE — TWO TRIGGERS, AND THE DELETE ARM IS NOT OPTIONAL.
--
-- An UPDATE-only guard would leave the invariant reachable, because losing your
-- admin role is not the only way to stop being an admin: 20260901010000_
-- account_deletion.sql routes self-serve deletion through
-- auth.admin.deleteUser(), and public.profiles.id is
-- `references auth.users(id) on delete cascade`. So the sole admin can empty the
-- system of admins from /dashboard/settings, on the OTHER origin, without ever
-- touching a role. A guard that only watches UPDATE would have claimed to make
-- "zero admins" unreachable while that door stood open.
--
-- Both arms share one function, branching on tg_op, so the count and the
-- break-glass cannot drift apart between them.
--
-- WHAT THE DELETE ARM DOES TO THE DELETE ROUTE. Raising here aborts the cascade,
-- which aborts auth.admin.deleteUser(), which surfaces to the caller as a failed
-- deletion. That is the correct answer — a sole admin must promote a successor
-- before they can leave — but app/api/account/delete must render it as a
-- sentence a person can act on, not as a raw constraint error. The errcode is
-- check_violation and the message is prefixed `last_admin:` so it can be matched.
--
-- Neither arm touches INSERT, so handle_new_user() inserting `role default
-- 'user'` is unaffected, and promoting the first admin by hand still works
-- (that is non-admin -> admin, which no arm acts on).
--
-- BREAK GLASS. The one legitimate reason to remove the last admin is winding an
-- environment down, and locking the owner out of their own database to prevent a
-- mistake is the wrong trade. So, inside the transaction:
--     set local app.allow_last_admin_removal = 'on';
-- Session-local, deliberately awkward to type, and it leaves a trace in whatever
-- ran it. APPLICATION CODE MUST NEVER SET THIS.
create or replace function public.profiles_keep_one_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.profiles;
  v_losing  boolean;
  v_others  integer;
begin
  -- A BEFORE trigger must return the row it is inspecting: OLD for a delete,
  -- NEW for an update. Returning the wrong one silently cancels the statement.
  v_row := case when tg_op = 'DELETE' then old else new end;

  v_losing := case
                when tg_op = 'DELETE' then old.role = 'admin'
                else old.role = 'admin' and new.role is distinct from 'admin'
              end;

  if not v_losing then
    return v_row;
  end if;

  if coalesce(current_setting('app.allow_last_admin_removal', true), '') = 'on' then
    return v_row;
  end if;

  -- Same lock as profile_set_role(), so a demotion arriving through some other
  -- code path serializes against one arriving through the function. Taking it in
  -- only one of the two places would leave exactly the race the function's copy
  -- exists to close.
  perform pg_advisory_xact_lock(hashtext('public.profiles.role'));

  select count(*) into v_others
    from public.profiles where role = 'admin' and id <> old.id;

  if v_others = 0 then
    raise exception 'last_admin: refusing to leave this system with no admin account'
      using errcode = 'check_violation';
  end if;

  return v_row;
end $$;

drop trigger if exists profiles_keep_one_admin on public.profiles;
create trigger profiles_keep_one_admin
  before update of role on public.profiles
  for each row execute function public.profiles_keep_one_admin();

-- The arm that closes the cascade door. Separate trigger because `before delete`
-- cannot carry an `of role` column list.
drop trigger if exists profiles_keep_one_admin_on_delete on public.profiles;
create trigger profiles_keep_one_admin_on_delete
  before delete on public.profiles
  for each row execute function public.profiles_keep_one_admin();


-- ============================================================ revoke / grant
-- Against the EXACT signatures, for the reason 20260829120000_credit_billing.sql
-- gives: a revoke naming a signature that does not exist silently does nothing
-- and leaves the function world-callable.
--
-- subscription_set is re-listed because it was DROPPED and recreated above, so
-- the grant the razorpay migration gave it went with the old function.
--
-- If this is wrong the symptom is silent. Verify with \df+ and check the access
-- privileges column reads service_role only.
do $$
declare f text;
begin
  foreach f in array array[
    'public.subscription_set(uuid,text,text,timestamptz,text,text,uuid,text,text)',
    'public.profile_set_role(uuid,text,uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;


-- ============================================================ schema cache
-- PostgREST answers from a cached copy of the schema. Without this, the first
-- rpc('profile_set_role') fails with "Could not find the function
-- public.profile_set_role in the schema cache" — which reads like the migration
-- failed when it succeeded. Same for the first read of subscription_events.
-- Idiom borrowed from 20260901010000_account_deletion.sql.
notify pgrst, 'reload schema';
