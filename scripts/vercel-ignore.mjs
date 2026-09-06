#!/usr/bin/env node
/**
 * HARDENED 2026-09-06 ─ Vercel's Ignored Build Step, with the silent failure
 * mode removed.
 *
 * Vercel's contract is backwards from every other exit code in this repo:
 *
 *     exit 0  =  SKIP this build
 *     exit 1  =  BUILD
 *
 * The rule these projects used to run was a one-liner in the dashboard:
 *
 *     git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" "$VERCEL_GIT_COMMIT_SHA" \
 *       -- apps/web packages package.json package-lock.json || exit 1
 *
 * which is correct right up until `apps/web` stops existing. A pathspec that
 * matches nothing always diffs clean. `git diff --quiet` exits 0. Vercel reads 0
 * as skip. Both the web and site projects stopped deploying on 2026-09-06 and
 * went on reporting success on every push, because a build that never runs
 * cannot fail.
 *
 * The rule this script follows instead: SKIPPING IS THE CLAIM THAT NEEDS PROOF.
 * Every uncertainty — an app that cannot be identified, a watched path that is
 * not on disk, a missing previous SHA, a git invocation that errors — exits 1
 * and builds. Over-building costs build minutes. Under-building costs a payment
 * webhook fix that everyone believes shipped.
 *
 * Wired in from vercel.json's `ignoreCommand`, so all three projects share it.
 *
 *   node scripts/vercel-ignore.mjs
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { APPS, SHARED_PATHS, HOW_TO_FIX, resolveTarget } from './vercel-target.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const BUILD = 1
const SKIP = 0

/** @param {string} reason */
function build (reason) {
  console.log(`▲ building — ${reason}`)
  process.exit(BUILD)
}

/** @param {string} reason */
function skip (reason) {
  console.log(`▲ skipping — ${reason}`)
  process.exit(SKIP)
}

// ── which app is this project? ──────────────────────────────────────────────
const target = resolveTarget()
if (!target.app) {
  // Loud, and still builds. An unidentifiable project is a broken project, and
  // the right way for it to say so is a failed build rather than a silent halt.
  console.error(`▲ cannot tell which app this Vercel project builds: ${target.why}`)
  console.error(`▲ ${HOW_TO_FIX}`)
  build('the app could not be identified, and skipping an unknown app is never safe')
}

const { dir } = APPS[target.app]
const watched = [dir, ...SHARED_PATHS]

// ── the check the old one-liner could not make ──────────────────────────────
/*
  This is the whole point of the file. `git diff` is asked about paths, and it
  answers "no changes" for a path that does not exist just as cheerfully as for
  one that genuinely did not change. Confirming the paths are real BEFORE
  trusting a clean diff is what turns the 2026-09-06 rename from a silent
  outage into a failed deploy.
*/
const missing = watched.filter((p) => !existsSync(join(root, p)))
if (missing.length) {
  console.error(`▲ these watched paths do not exist in the repo: ${missing.join(', ')}`)
  console.error('▲ a pathspec that matches nothing always diffs clean, so this must never be read as "unchanged".')
  console.error('▲ Fix: update APPS/SHARED_PATHS in scripts/vercel-target.mjs to match the tree.')
  build('a watched path is missing, so a clean diff would prove nothing')
}

// ── the diff itself ─────────────────────────────────────────────────────────
const previous = process.env.VERCEL_GIT_PREVIOUS_SHA
const current = process.env.VERCEL_GIT_COMMIT_SHA

// First deploy of a project, a redeploy from the dashboard, or a clone shallow
// enough that there is no previous commit to compare against.
if (!previous || !current) build('there is no previous commit to compare against')
if (previous === current) build('the previous and current SHAs are the same')

const diff = spawnSync(
  'git',
  ['diff', '--quiet', previous, current, '--', ...watched],
  { cwd: root, encoding: 'utf8' },
)

/*
  Exit 0 = no differences, 1 = differences, anything else = git itself failed,
  which on Vercel usually means a shallow clone that does not contain the
  previous SHA. That is not evidence of "unchanged", so it builds.
*/
if (diff.error || diff.status === null || diff.status > 1) {
  console.error(`▲ git diff did not answer cleanly: ${diff.error?.message ?? diff.stderr?.trim() ?? `exit ${diff.status}`}`)
  build('the diff could not be computed, so nothing has been ruled out')
}

if (diff.status === 1) {
  build(`${target.app} (resolved from ${target.how}) has changes in: ${watched.join(', ')}`)
}

skip(`nothing under ${watched.join(', ')} changed between ${previous.slice(0, 7)} and ${current.slice(0, 7)}`)
