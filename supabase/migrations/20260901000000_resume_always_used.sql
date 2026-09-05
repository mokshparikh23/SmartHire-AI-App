-- OWN-CV 2026-09-01
--
-- A resume on an interview is a resume in the prompt. The tick is gone.
--
-- WHAT WAS THERE. 20260830020000 taught touch_interview_profile() to clear
-- resume_consent whenever resume_file_path changed, on the rule that "consent
-- belongs to a document, not to a profile": a new file had not been agreed to,
-- so the old answer was not an answer to the question being asked. That rule was
-- right for the product it was written for — an interviewer running a copilot
-- against a CV belonging to the person across the table.
--
-- WHY IT GOES. That product no longer exists here. The reader IS the candidate,
-- the document is their own, and they uploaded it to their own interview for one
-- purpose. Asking them to confirm afterwards was not a protection; it was a
-- second step that people missed, and missing it cost them the thing they came
-- for — the resume sat in the row, every answer came out generic, and nothing on
-- screen said why. This trigger made that worse than a plain unticked box:
-- replacing a resume silently un-ticked it again, so the users most likely to be
-- caught were the ones who had already been through the flow once.
--
-- Removing a resume is still how you stop it being used, and that path deletes
-- the stored file rather than leaving it on the account behind a false flag.
-- That is strictly more removal than unticking ever was.
--
-- WHY THE COLUMN SURVIVES. resume_consent stays, NOT NULL, and is written true
-- whenever a resume exists (apps/web/lib/resume.js toRow, and
-- apps/web/app/api/resume/parse). A desktop build older than this change still
-- gates buildSystemPrompt() on the flag, and those installs update on their own
-- schedule; a column left false would silently drop the resume for exactly the
-- users who can no longer see the box they would have looked for. Writing true
-- turns that old gate into a no-op instead of a trap. Dropping the column is a
-- later migration, once no build in the wild reads it.

-- ============================================================ trigger
-- Restated in full rather than patched, because `create or replace function`
-- replaces the whole body — the two lines above the removed block are load-
-- bearing and have to be carried across verbatim.
create or replace function public.touch_interview_profile()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  -- Belt and braces with the update policy's `with check`: even a future
  -- service-role caller cannot silently re-owner a row through this path.
  new.user_id = old.user_id;

  -- OWN-CV 2026-09-01: what stood here, and why it is not here any more, is the
  -- whole subject of the header above.
  --
  --   if new.resume_file_path is distinct from old.resume_file_path then
  --     new.resume_consent = false;
  --   end if;
  --
  -- Note the ordering this frees up: /api/resume/parse writes resume_file_path
  -- and resume_consent in ONE update, so with the reset in place a route that
  -- set the flag true would have had it cleared inside its own statement.

  return new;
end;
$$;

-- The trigger itself is unchanged and is deliberately not re-created: it binds
-- to the function by name, so replacing the function is the whole change.

-- ============================================================ backfill
-- Every interview that already has a resume now counts as using it. Without
-- this, the change reaches new uploads only — an account whose resume was
-- attached last week would keep running generic sessions until they happened to
-- re-save the row, which is the exact failure being fixed.
--
-- THE TRIGGER IS OFF FOR THIS STATEMENT, and that is the point of the two ALTERs
-- rather than laziness about the reset above: touch_interview_profile() sets
-- updated_at = now() on every update, so a bare backfill would stamp every
-- affected row as edited today. "Updated" is shown to the user next to each
-- interview; a migration must not claim they touched something they did not.
alter table public.interview_profiles disable trigger interview_profiles_touch;

update public.interview_profiles
   set resume_consent = true
 where resume_consent = false
   and resume is not null
   and btrim(resume) <> '';

alter table public.interview_profiles enable trigger interview_profiles_touch;

-- The converse is NOT backfilled. A row with no resume and consent true is not
-- a state this app can produce — toRow() writes Boolean(resume) — and hunting
-- for one would only risk clearing a flag some future writer set for a reason
-- this migration cannot see.

-- ============================================================ schema cache
-- Nothing about the table's shape changed, so PostgREST has nothing to reload.
-- Said explicitly because every other migration in this directory ends with a
-- notify and its absence here should read as deliberate.
