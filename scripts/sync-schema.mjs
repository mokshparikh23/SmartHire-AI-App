#!/usr/bin/env node
/**
 * Regenerates apps/web/supabase-schema.sql from its two sources.
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
 *   node scripts/sync-schema.mjs           regenerate
 *   node scripts/sync-schema.mjs --check   fail if out of date (for CI)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATION = join(root, 'supabase/migrations/20260829120000_credit_billing.sql')
const DDL       = join(root, 'scripts/schema-ddl.sql')
const TARGET    = join(root, 'apps/web/supabase-schema.sql')

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

const expected =
  readFileSync(DDL, 'utf8').trimEnd() + '\n\n' +
  migration.slice(from, to).trimEnd() + '\n\nnotify pgrst, \'reload schema\';\n'

if (process.argv.includes('--check')) {
  let actual = ''
  try { actual = readFileSync(TARGET, 'utf8') } catch { /* missing counts as stale */ }
  if (actual !== expected) {
    console.error('apps/web/supabase-schema.sql is out of date.')
    console.error('Run: node scripts/sync-schema.mjs')
    process.exit(1)
  }
  console.log('apps/web/supabase-schema.sql is in sync.')
  process.exit(0)
}

writeFileSync(TARGET, expected)
const fns = [...expected.matchAll(/^create or replace function (public\.\w+)/gm)].map(m => m[1])
console.log(`Wrote ${TARGET} (${expected.split('\n').length} lines, ${fns.length} functions).`)
