-- Schema for the Smart Hire AI backend.
-- Reconstructed from the queries in app/ and lib/ — the original project had no
-- migrations checked in. Run this once in the Supabase SQL editor on a new project.

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
-- user_id must be a real FK to profiles: PostgREST resolves the
-- .select('*, profiles(email, full_name)') embed through this constraint.
create table if not exists public.licenses (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  license_key            text not null unique,
  plan                   text not null check (plan in ('monthly', 'yearly', 'lifetime')),
  status                 text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  stripe_subscription_id text,
  stripe_customer_id     text,
  expires_at             timestamptz,   -- null for lifetime plans
  created_at             timestamptz not null default now()
);

create index if not exists licenses_user_id_idx     on public.licenses (user_id);
create index if not exists licenses_license_key_idx on public.licenses (license_key);

-- ---------------------------------------------------------------- usage
create table if not exists public.usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  action     text,
  created_at timestamptz not null default now()
);

create index if not exists usage_user_id_idx on public.usage (user_id);

-- ---------------------------------------------------------------- RLS
-- Dashboard pages read through the cookie-session client, so each user needs
-- read access to their own rows. Admin pages and the license validate endpoint
-- use the service-role client, which bypasses RLS entirely.
alter table public.profiles enable row level security;
alter table public.licenses enable row level security;
alter table public.usage    enable row level security;

drop policy if exists "read own profile"   on public.profiles;
drop policy if exists "update own profile" on public.profiles;
drop policy if exists "read own licenses"  on public.licenses;
drop policy if exists "read own usage"     on public.usage;

create policy "read own profile"   on public.profiles for select using (auth.uid() = id);
create policy "update own profile" on public.profiles for update using (auth.uid() = id);
create policy "read own licenses"  on public.licenses for select using (auth.uid() = user_id);
create policy "read own usage"     on public.usage    for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------- grants
-- Policies decide WHICH ROWS a user may touch; grants decide whether the role
-- may touch the table at all. Both are required — with policies but no grants
-- every dashboard query fails with "permission denied for table", which reads
-- on the client as a silently empty dashboard.
--
-- Supabase adds these grants automatically for tables created in the SQL
-- editor, but not when this file is applied through the Management API, so
-- state them explicitly and keep the file safe to run either way.
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.licenses, public.usage to authenticated;

-- Writes are deliberately narrow. Everything else (issuing and revoking
-- licenses, changing roles, recording usage) goes through the service-role
-- client in app/api/, which bypasses RLS and these grants.
--
-- The update policy above authorises the ROW; this grant authorises the
-- COLUMN. Without it a signed-in user could promote themselves with a single
-- update({ role: 'admin' }) from the browser console, because the policy
-- places no restriction on which columns of their own row they may write.
revoke update on public.profiles from authenticated, anon;
grant  update (full_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------- profile trigger
-- AuthForm calls supabase.auth.signUp({ options: { data: { full_name } } }) and
-- never writes a profile row, so the profile has to be created database-side.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- This database is shared with another product that signs users in
  -- anonymously. Those sessions have no email and never use the desktop app,
  -- so skip them instead of filling the admin user list with blank rows.
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
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
