-- DELETE-ACCOUNT 2026-09-01
--
-- Self-serve account deletion, and the one thing that must survive it.
--
-- Deletion is immediate and irreversible. app/api/account/delete calls
-- auth.admin.deleteUser(); profiles.id cascades off auth.users, and every other
-- user-scoped table in this schema cascades off profiles(id). One statement, one
-- transaction, nothing half-deleted.
--
-- WHAT MUST NOT GO WITH IT. A payment is not the user's data to erase — it is a
-- record we are required to keep and required to be able to PRODUCE. The
-- practical version of that requirement: someone writes in eighteen months
-- asking what a charge on their card was for, and "we deleted your account" is
-- not an answer.
--
-- So the delete route copies the account's orders here FIRST, and only then
-- destroys the account. This table has NO foreign key to anything, and that
-- absence IS the design: it is the one thing in this schema that outlives
-- profiles.
--
-- WHY NOT `credit_orders.user_id` NULLABLE WITH ON DELETE SET NULL. It was the
-- other candidate and it loses on two counts. credit_orders carries
-- `grant select … to authenticated` plus a `auth.uid() = user_id` policy, so
-- orphaned rows would live in a table the browser queries on every billing-page
-- load, guarded by a policy rather than by the absence of a grant. And a receipt
-- needs an EMAIL and a NAME, which credit_orders does not have and should not
-- grow — that is PII on a hot table two webhooks write to, needed only after the
-- account is gone.
--
-- WHY EVERY ROW AND NOT JUST status='paid'. `refunded` is a tax event as much as
-- `paid` is. And a `pending` row is the only trace of an IN-FLIGHT payment: if a
-- Razorpay payment link is still open when the account goes, the webhook finds
-- no order and breaks, and without this the money arrives attached to nothing.
--
-- WHY IDENTITY IS DENORMALISED ONTO EVERY ROW rather than into a header table.
-- One row has to be a complete receipt on its own. A join to a second table is a
-- join that can fail, and an archive whose identity half has been purged out
-- from under it is not an archive.

-- ============================================================ billing_archive
create table if not exists public.billing_archive (
  id uuid primary key default gen_random_uuid(),

  -- ── who ──────────────────────────────────────────────────────────────────
  -- NO foreign key, deliberately. The row it would point at is gone by design.
  deleted_user_id uuid not null,

  -- Taken from auth.users at the moment of deletion (getUser().email), not from
  -- profiles.email. They are the same today because nothing in the app updates
  -- profiles.email — ProfileForm renders it disabled — but an address changed
  -- through the Supabase dashboard would leave profiles stale, and the receipt
  -- must carry the address the person actually uses.
  email     text,
  -- Self-declared: profiles.full_name is user-writable free text. Kept because a
  -- receipt with a name is more useful than one without, and labelled here so
  -- nobody later mistakes it for a verified legal name.
  full_name text,

  -- ── the order, copied verbatim from public.credit_orders ─────────────────
  order_id          uuid not null,
  gateway           text not null,
  kind              text not null,
  pack_id           text,
  credits           integer not null default 0,
  bonus_credits     integer not null default 0,
  subscription_kind text,
  -- Same type and same units as credit_orders.amount_minor: an integer in minor
  -- units, paise or cents. Never widened and never converted — a stray /100
  -- anywhere on this path is how a receipt comes out a hundredth of the amount
  -- actually charged.
  amount_minor      integer not null,
  currency          text not null,
  status            text not null,
  ordered_at        timestamptz not null,   -- credit_orders.created_at
  paid_at           timestamptz,

  -- ── gateway handles ──────────────────────────────────────────────────────
  -- How an operator finds the transaction in the Stripe or Razorpay dashboard,
  -- which is where a legally usable receipt actually comes from — ours is the
  -- index, theirs is the document.
  --
  -- The two customer ids live on credit_wallets rather than on the order, so the
  -- delete route reads the wallet BEFORE anything clears it and stamps them onto
  -- every row. They are also the only way to find a mandate that was not
  -- cancelled cleanly, after the wallet that held its id has ceased to exist.
  stripe_checkout_session_id text,
  stripe_payment_intent_id   text,
  stripe_subscription_id     text,
  stripe_customer_id         text,
  razorpay_payment_link_id   text,
  razorpay_payment_id        text,
  razorpay_subscription_id   text,
  razorpay_customer_id       text,

  archived_at timestamptz not null default now(),

  -- IDEMPOTENCY. The delete route is retryable end to end, and a retry that ran
  -- after a gateway timeout must not double the archive. The route upserts on
  -- this constraint with ignoreDuplicates.
  constraint billing_archive_one_row_per_order unique (order_id)
);

comment on table public.billing_archive is
  'Append-only. Orders belonging to accounts that have been deleted. No FK to '
  'profiles by design - these rows outlive the account. Written only by '
  'app/api/account/delete; removed only by purge_expired_billing_archive().';

-- ============================================================ indexes
-- Support answers exactly two questions: "here is my card statement, what was
-- this charge" starting from an EMAIL, and the same starting from a GATEWAY
-- PAYMENT ID. Those are the lookups, so those are the indexes.
--
-- lower(email) rather than a plain btree: people write their address back to you
-- in whatever case their mail client used, and this table has no citext.
create index if not exists billing_archive_email_idx
  on public.billing_archive (lower(email)) where email is not null;

create index if not exists billing_archive_user_idx
  on public.billing_archive (deleted_user_id);

-- Partial, because a row is one gateway or the other and never both.
create index if not exists billing_archive_stripe_pi_idx
  on public.billing_archive (stripe_payment_intent_id) where stripe_payment_intent_id is not null;
create index if not exists billing_archive_stripe_sub_idx
  on public.billing_archive (stripe_subscription_id) where stripe_subscription_id is not null;
create index if not exists billing_archive_rzp_payment_idx
  on public.billing_archive (razorpay_payment_id) where razorpay_payment_id is not null;
create index if not exists billing_archive_rzp_sub_idx
  on public.billing_archive (razorpay_subscription_id) where razorpay_subscription_id is not null;

-- The purge scans this.
create index if not exists billing_archive_retention_idx
  on public.billing_archive (coalesce(paid_at, ordered_at));

-- ============================================================ RLS and grants
-- The storage_orphans idiom, verbatim: RLS on, ZERO policies, grants revoked.
-- Nothing in a browser reads or writes this, and with no permissive policy
-- nothing can — even if a future migration or a dashboard copy-paste re-grants
-- select by accident.
alter table public.billing_archive enable row level security;
revoke all on public.billing_archive from anon, authenticated;

-- SELECT and INSERT only, and that is not tidiness. The route writes rows and
-- reads them back to prove they landed; nothing needs to change or drop one.
-- Deletion is reachable through exactly one door — the security definer purge
-- below, which runs as the owner and therefore needs no grant of its own.
grant select, insert on public.billing_archive to service_role;

-- ============================================================ retention
-- Eight years, because that is the longest of the retention clocks these rows
-- sit under and a receipt is worthless the day after it is discarded. Kept as a
-- function with no caller, exactly like purge_expired_resume_files: the policy
-- is written down and executable, and turning it on is a scheduling decision
-- rather than a code change.
create or replace function public.purge_expired_billing_archive(p_years integer default 8)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare v_count integer;
begin
  with expired as (
    delete from public.billing_archive
     where coalesce(paid_at, ordered_at) < now() - make_interval(years => p_years)
    returning 1
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

-- Revoked BY EXACT SIGNATURE. A revoke naming a signature that does not exist
-- silently does nothing and leaves the function world-callable, which is why the
-- argument type is spelled out rather than guessed.
do $$
declare f text;
begin
  foreach f in array array[
    'public.purge_expired_billing_archive(integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ============================================================ schema cache
-- PostgREST answers from a cached copy of the schema, so without this the first
-- insert fails with "Could not find the 'order_id' column of 'billing_archive'
-- in the schema cache" — which reads like the migration failed when it
-- succeeded.
notify pgrst, 'reload schema';
