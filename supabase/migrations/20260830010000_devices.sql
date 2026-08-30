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
