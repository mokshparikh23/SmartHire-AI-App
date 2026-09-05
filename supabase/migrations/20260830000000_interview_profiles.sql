-- SETUP-TO-WEB 2026-08-30
--
-- Interview setup moves out of the desktop app and onto the web.
--
-- Until now company/role/resume/JD lived only in the desktop's zustand store,
-- persisted to localStorage under 'ia-settings' — invisible to the account,
-- lost on reinstall, and re-entered through a three-step wizard before every
-- interview. This table is the server-side home for it, one row per candidate
-- the user is going to interview. The desktop stops collecting any of it and
-- just picks a row.
--
-- WHY THE CONSENT FLAG LIVES HERE
--
-- resume_consent records that the candidate agreed to their resume being used
-- by the copilot. It travels WITH the resume, in the same row, because the two
-- are only ever meaningful together: a resume whose consent state has been
-- separated from it is a resume nobody can safely use.
--
-- This column is not the enforcement point. buildSystemPrompt() in
-- apps/desktop/src/services/systemPrompt.js is — it omits the RESUME section
-- entirely when the flag is false, so an unconsented resume cannot reach the
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
-- the latter on update, a user could re-assign user_id and hand a row — resume
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
