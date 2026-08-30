-- ANSWER-STYLE 2026-08-30
--
-- The register the copilot writes in, chosen per candidate.
--
-- Everything the copilot produces today comes out in one voice: formal written
-- English, full sentences, the register of a cover letter. That is the right
-- default and it stays the default. It is also, for a large part of who this
-- product is actually for, the wrong voice to be handed mid-interview — India is
-- the reference market (see apps/web/lib/pricing.js, where INR is the currency
-- every price was set in), the conversation in the room is plain Indian English,
-- and a follow-up the interviewer has to rewrite in their head before they can
-- say it out loud is a follow-up that arrives too late to use.
--
-- So this is a REGISTER switch and nothing more. 'desi' changes word choice,
-- sentence length and the kind of example reached for. It does not change what
-- a follow-up may claim, what the résumé is allowed to contribute, or whether
-- the résumé is used at all — that gate is still resume_consent, still enforced
-- in buildSystemPrompt() on the desktop, and this column is nowhere near it.
-- styleBlock() in apps/desktop/src/services/systemPrompt.js is the only consumer,
-- and its doc comment is where the boundary is written down.
--
-- WHY PER PROFILE AND NOT PER ACCOUNT
--
-- Because it is a fact about the candidate, not a preference of the
-- interviewer's. One account interviews a Bengaluru SDE2 on Monday and a
-- Singapore PM on Tuesday, and an account-level setting would silently carry
-- Monday's register into Tuesday's room. It lives in the same row as the
-- company, the role and the résumé for the same reason those do: it is the
-- context of one interview, created once on the web and picked in the desktop
-- launcher.
--
-- The desktop may override it for the session in front of it without writing
-- back. This column is the starting value, not the running one.

-- ============================================================ column
-- NOT NULL with a default rather than a nullable column, matching resume_source
-- in 20260830020000. Every existing row backfills to 'plain', which is what they
-- have effectively been all along, and nothing downstream ever has to answer
-- "what does null mean here" — a question three separate files would otherwise
-- each have to answer the same way, and eventually not.
--
-- Postgres 11+ records a non-volatile default in the catalogue instead of
-- rewriting the heap, so this is fast on a table of any size.
alter table public.interview_profiles
  add column if not exists answer_style text not null default 'plain';

comment on column public.interview_profiles.answer_style is
  'Register the copilot writes in: plain (formal written English, the default) or desi (plain, direct Indian English). Read by the desktop through /api/profiles; the desktop may override it for one session without writing back.';

-- ============================================================ constraint
-- A CHECK, not a bare text column. Three reasons, in order of how much they
-- matter:
--
--   1. This column IS browser-writable — it is in the column grants below,
--      because the dashboard form has to write it as the signed-in user. So
--      "the UI only ever sends one of two strings" is a statement about our
--      code, not about the data. Anyone holding the anon key that ships in the
--      web bundle can PATCH this column to any string they like from a console.
--   2. That string then travels to the desktop through /api/profiles and lands
--      in the store buildSystemPrompt() reads. Whether it is interpolated into
--      a prompt or used to look one up is the desktop's business and may
--      change; a column that can only ever hold one of two known tokens means
--      that decision can never become a prompt-injection question.
--   3. It is the same discipline as resume_source above and credit_ledger.kind.
--      A new closed vocabulary in this schema is a CHECK list, so a reader
--      learns the allowed values from the table rather than from whichever
--      component happened to be honest.
--
-- The cost is that adding a third register needs a migration. That cost is the
-- feature: 'desi' has to mean the same thing to the database, the dashboard and
-- the prompt on the same day, and a migration is what makes those three land
-- together. An enum type would do the same job with worse ergonomics — altering
-- one is transactionally awkward and PostgREST surfaces it as a bespoke type.
--
-- `add constraint if not exists` does not exist, so drop-then-add keeps this
-- re-runnable — same note as 20260830020000.
alter table public.interview_profiles
  drop constraint if exists interview_profiles_answer_style_check;

alter table public.interview_profiles
  add constraint interview_profiles_answer_style_check
    check (answer_style in ('plain', 'desi'));

-- ============================================================ column grants
-- SECURITY / READ THIS BEFORE ADDING ANY FURTHER COLUMN TO THIS TABLE.
--
-- 20260830020000 withdrew the blanket insert/update grant on this table and
-- re-granted it PER COLUMN, so that resume_file_path could not be forged or
-- blanked from a browser. The consequence, which is easy to miss because it
-- fails quietly and in the wrong place, is that a column added afterwards is
-- INVISIBLE TO THE BROWSER WRITER until it is named in a grant. There are TWO
-- lists over there — `grant insert (...)` and `grant update (...)` — and a
-- column named in only one of them produces a feature that works when you
-- create an interview and fails when you edit one, or the reverse.
--
-- These two lines are ADDITIVE, not a restatement of those lists. Column
-- privileges accumulate: granting UPDATE on one column does not disturb the
-- grants on the other eight, because each lands as its own entry in
-- pg_attribute.attacl. Restating the whole list here would mean repeating the
-- table-level `revoke insert, update` first to make the restatement exact — and
-- a table-level REVOKE also revokes every column-level privilege on that table,
-- so it would silently strip any column granted by a migration written between
-- that file and this one. Two lines that can only add are the safer shape.
--
-- The effective grant is therefore the UNION of the lists in 20260830020000 and
-- the two lines below. information_schema.column_privileges is where you read
-- the real answer.
--
-- Nothing is granted to anon. 20260830000000 revoked everything from that role
-- on this table on purpose — the desktop holds a licence key, not a Supabase
-- session, and reads through /api/profiles on the service role.
grant insert (answer_style) on public.interview_profiles to authenticated;
grant update (answer_style) on public.interview_profiles to authenticated;

-- ============================================================ schema cache
-- Same failure as every other new column here: PostgREST answers from a cached
-- copy of the schema, so the first save can fail with "Could not find the
-- 'answer_style' column of 'interview_profiles' in the schema cache" — which
-- reads exactly like the migration did not apply, when in fact it did.
notify pgrst, 'reload schema';
