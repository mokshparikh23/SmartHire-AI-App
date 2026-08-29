-- Forward fix for drift between apps/web/supabase-schema.sql and the initial
-- migration. The grants below were added to the schema file in commit bd5df64
-- but never reached supabase/migrations/00000000000000_init.sql.
--
-- 00000000000000_init.sql has now been corrected too, which covers a fresh
-- database. This migration is what actually lands the fix on any database that
-- already recorded 00000000000000 as applied — editing an applied migration
-- never re-runs it. On a fresh database this file is a harmless no-op.

-- ---------------------------------------------------------------- grants
-- Policies decide WHICH ROWS a role may touch; grants decide whether the role
-- may touch the table at all. Both are required. With policies but no grants,
-- every dashboard query fails with "permission denied for table", which reads
-- on the client as a silently empty dashboard.
--
-- Supabase adds these grants automatically for tables created in the SQL
-- editor, but not for tables created by `supabase db push` or the Management
-- API — which is how this drift became invisible.
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.licenses, public.usage to authenticated;

-- SECURITY: this is the privilege-escalation fix, not a tidy-up.
--
-- The "update own profile" policy in the initial migration authorises the ROW
-- but places no restriction on WHICH COLUMNS of that row may be written. The
-- column-level grant below is the only thing stopping a signed-in user from
-- running update({ role: 'admin' }) against their own profile from the browser
-- console and promoting themselves to admin.
revoke update on public.profiles from authenticated, anon;
grant  update (full_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------- anon guard
-- This database is shared with another product that signs users in
-- anonymously. Those sessions have no email and never use the desktop app, so
-- skip them instead of filling the admin user list with blank rows.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
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
