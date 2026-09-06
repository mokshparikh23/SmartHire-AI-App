#!/usr/bin/env node
/**
 * HARDENED 2026-09-06 ─ the Build Command for all three Vercel projects.
 *
 * It used to be `npm run build:web` / `npm run build:site` / `npm run
 * build:admin`, typed into three settings pages. Two of those three scripts
 * stopped existing the day apps/web became apps/dashboard and apps/site became
 * apps/marketing, and a settings page is not somewhere a rename can reach.
 *
 * This is the loud half of that breakage — a missing npm script fails the
 * deploy — so unlike scripts/vercel-ignore.mjs it was never dangerous, only
 * broken. It moves into the repo anyway, because leaving one of the two here
 * and one in the dashboard is how the next person ends up believing the
 * dashboard is still the source of truth for the other.
 *
 * Wired in from vercel.json's `buildCommand`.
 *
 *   node scripts/vercel-build.mjs
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { APPS, HOW_TO_FIX, resolveTarget } from './vercel-target.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const target = resolveTarget()
if (!target.app) {
  /*
    No fallback and no default. Building "probably the dashboard" onto whatever
    domain this project happens to serve is the one outcome worse than not
    deploying: it is how a marketing hostname starts serving the payments
    backend, and it would do it with a green check mark.
  */
  console.error(`\n✗ cannot tell which app this Vercel project builds: ${target.why}`)
  console.error(`\n  ${HOW_TO_FIX}\n`)
  process.exit(1)
}

const { script, dir } = APPS[target.app]
console.log(`▲ building ${target.app} (${dir}) via \`npm run ${script}\` — resolved from ${target.how}`)

/*
  Run from the repo root, never from inside apps/*. Vercel's Root Directory is
  left empty for all three projects for the same reason: npm hoists workspace
  packages into the root node_modules, and an install scoped to a workspace does
  not link them. The Output Directory setting (apps/<app>/.next) is what points
  Vercel at the result, and it is the one build setting still living in the
  dashboard.
*/
const result = spawnSync('npm', ['run', script], { cwd: root, stdio: 'inherit' })
process.exit(result.status ?? 1)
