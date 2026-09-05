#!/usr/bin/env node
/**
 * Regenerates apps/dashboard/supabase-schema.sql from its sources.
 *
 * That file is the complete, runnable schema for a fresh database — paste it
 * into the Supabase SQL editor and you get what replaying every migration
 * gives you. Keeping it in step by hand is exactly what failed before: grants
 * were added to the schema file in bd5df64, never reached the migration, and
 * re-opened role escalation until c548a01.
 *
 * So the half that matters is not retyped. Table shapes live in
 * scripts/schema-ddl.sql (a fresh database declares them directly instead of
 * ALTERing its way to them), and every function, policy and grant is copied
 * verbatim out of the credit-billing migration.
 *
 * BUGFIX 2026-08-30 ─ later migrations were not read at all ──────────────────
 * The two sources above are everything this script used to look at, so every
 * migration written AFTER the credit-billing one was silently absent from the
 * generated file. interview_profiles, devices and touch_interview_profile()
 * had already gone missing that way, which made the promise three paragraphs
 * up ("what replaying every migration gives you") false — the same class of
 * drift the promise exists to prevent.
 *
 * Later migrations are now appended verbatim, in filename order. That is safe
 * because every one of them declares idempotently — `create table if not
 * exists`, `create or replace function`, and `drop policy/trigger if exists`
 * ahead of each create — so re-running is a no-op and a duplicated
 * `create or replace` simply lets the later definition win, which is precisely
 * what a replay does.
 *
 *   node scripts/sync-schema.mjs           regenerate
 *   node scripts/sync-schema.mjs --check   fail if out of date (for CI)
 */
// import { readFileSync, writeFileSync } from 'node:fs'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// import { dirname, join } from 'node:path'
import { basename, dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATION = join(root, 'supabase/migrations/20260829120000_credit_billing.sql')
const DDL       = join(root, 'scripts/schema-ddl.sql')
const TARGET    = join(root, 'apps/dashboard/supabase-schema.sql')

// Everything from this marker on is logic rather than table shape, and is
// identical in both files.
const LOGIC_START = '-- ============================================================ wallet_is_unlimited'
// ...except the backfill, which only means anything against a database that
// already has rows.
const LOGIC_END = '-- ============================================================ backfill'

const migration = readFileSync(MIGRATION, 'utf8')
const from = migration.indexOf(LOGIC_START)
const to = migration.indexOf(LOGIC_END)
if (from === -1 || to === -1 || to < from) {
  console.error(`sync-schema: could not find the logic section markers in ${MIGRATION}.`)
  console.error('If you renamed a section header, update LOGIC_START / LOGIC_END here too.')
  process.exit(1)
}

/* BUGFIX 2026-08-30: everything the migrations directory holds after the
   credit-billing one. Sorted by filename, which is how the timestamp prefix
   orders a replay — so a later migration replacing an earlier definition lands
   in the same order the database saw it. */
const later = readdirSync(dirname(MIGRATION))
  .filter((f) => f.endsWith('.sql') && f > basename(MIGRATION))
  .sort()
  .map((f) => `-- ${'='.repeat(60)} ${f}\n` +
              readFileSync(join(dirname(MIGRATION), f), 'utf8').trimEnd())

// const expected =
//   readFileSync(DDL, 'utf8').trimEnd() + '\n\n' +
//   migration.slice(from, to).trimEnd() + '\n\nnotify pgrst, \'reload schema\';\n'
const expected =
  readFileSync(DDL, 'utf8').trimEnd() + '\n\n' +
  migration.slice(from, to).trimEnd() + '\n\n' +
  (later.length ? later.join('\n\n') + '\n\n' : '') +
  'notify pgrst, \'reload schema\';\n'

if (process.argv.includes('--check')) {
  let actual = ''
  try { actual = readFileSync(TARGET, 'utf8') } catch { /* missing counts as stale */ }
  if (actual !== expected) {
    console.error('apps/dashboard/supabase-schema.sql is out of date.')
    console.error('Run: node scripts/sync-schema.mjs')
    process.exit(1)
  }
  console.log('apps/dashboard/supabase-schema.sql is in sync.')
  process.exit(0)
}

writeFileSync(TARGET, expected)
const fns = [...expected.matchAll(/^create or replace function (public\.\w+)/gm)].map(m => m[1])
console.log(`Wrote ${TARGET} (${expected.split('\n').length} lines, ${fns.length} functions).`)
