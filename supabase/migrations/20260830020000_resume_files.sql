-- RESUME-UPLOAD 2026-08-30
--
-- A dropped PDF is now parsed into a structured, editable record, and THE
-- ORIGINAL FILE IS KEPT. That second half is the part worth reading twice.
--
-- Until today the most sensitive thing this table held was resume text the
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
-- WHAT THIS DOES NOT DO: it does not touch the enforcement point. The resume
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
  -- semantic in a resume; a JSON array preserves it without a position column.
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
  'Structured resume: {personal, introduction, education[], jobs[], other[]}. Flattened into resume on save; shape lives in apps/web/lib/resume.js.';
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

  -- normalizeParsed() in apps/dashboard/lib/resume.js is the real shape check. These
  -- two are the floor under it: whatever bug ships in that file, a row can never
  -- hold a bare string or a quarter-megabyte of model output. A resume is
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
-- particular: a user must be able to remove a candidate's resume from their
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
  -- resume, on the grounds that "the flag is meaningless without the text it
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
-- Private: a resume is the most sensitive thing this product stores, and a
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
-- BUGFIX 2026-08-30: ...but stating it is not something this role is allowed to
-- do. storage.objects is owned by supabase_storage_admin, and ALTER TABLE
-- requires ownership, so `supabase db push` died here with
-- "must be owner of table objects (SQLSTATE 42501)" and rolled the whole
-- migration back. The assumption above is correct — Supabase enables RLS on that
-- table itself — so the assertion costs nothing to drop and the policies below
-- are unaffected. It only ever succeeded when pasted into the SQL editor, which
-- runs as a role that happens to qualify.
-- alter table storage.objects enable row level security;

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
