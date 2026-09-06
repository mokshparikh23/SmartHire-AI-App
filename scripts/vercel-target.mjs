#!/usr/bin/env node
/**
 * HARDENED 2026-09-06 ─ which app is the Vercel project we are inside building?
 *
 * Three Vercel projects deploy from this one repo, all with Root Directory left
 * empty (the repo root, so npm hoists correctly — see "Deploying" in the README).
 * That means they share every file here, including vercel.json, and the ONLY
 * thing that can tell them apart at build time is their environment.
 *
 * Until this file existed, the thing that told them apart was a Build Command
 * and an Ignored Build Step typed by hand into each project's settings page. The
 * 2026-09-06 rename (apps/web -> apps/dashboard, apps/site -> apps/marketing)
 * invalidated all six of those strings at once, and only two of the six failure
 * modes were survivable:
 *
 *   - a stale Build Command (`npm run build:web`) fails the deploy LOUDLY,
 *   - a stale Ignored Build Step (`... -- apps/web packages`) fails SILENTLY:
 *     the path matches nothing, so the diff is clean, `git diff --quiet` exits
 *     0, Vercel reads 0 as *skip*, and the project stops deploying on every push
 *     while still reporting success.
 *
 * So the strings move into the repo, where a rename moves them too and
 * check-invariants.mjs fails if they ever stop pointing at a real app.
 *
 * WHAT STAYS IN THE DASHBOARD: one variable per project, `SMARTHIRE_APP`, whose
 * value is a key of APPS below. It is the only per-project build setting left,
 * it names a thing rather than a path, and it is not invalidated by moving a
 * directory. Output Directory is the other survivor, and it is in the loud half.
 */

/*
  `project` is the name of the Vercel project, which is NOT the directory name
  and deliberately never has been. The 2026-09-06 rename left all three project
  names alone: the `web` project's *.vercel.app hostname is baked into every
  packaged desktop build and there is no auto-updater, so renaming it strands
  every install. That mistake has been made here once already.

  It is recorded here because the fallback below reads it, and because this is
  now the one place in the repo where the two naming schemes sit side by side.
*/
export const APPS = {
  dashboard: { dir: 'apps/dashboard', script: 'build:dashboard', project: 'web' },
  marketing: { dir: 'apps/marketing', script: 'build:marketing', project: 'site' },
  admin: { dir: 'apps/admin', script: 'build:admin', project: 'admin' },
}

/*
  Paths that must force a rebuild for EVERY project, on top of the app's own
  directory. `packages` is the one with teeth: leave it out and a fix to
  @smarthire/data — the auth gate, the credit meter — deploys to the app and not
  to the console, which then runs old money-moving code with no signal that
  anything is stale. `scripts` is here because every app's build script shells
  out to assert-no-public-secrets.mjs, and vercel.json because it now carries the
  build and ignore commands themselves.
*/
export const SHARED_PATHS = [
  'packages',
  'scripts',
  'package.json',
  'package-lock.json',
  'vercel.json',
  '.nvmrc',
]

/**
 * Resolve the app this build is for.
 *
 * Returns { app, how } on success and { app: null, why } on failure. It never
 * guesses: an unrecognised name is an error, because the cost of guessing wrong
 * is the marketing domain quietly serving the payments backend.
 *
 * @param {Record<string, string|undefined>} env
 */
export function resolveTarget (env = process.env) {
  const explicit = (env.SMARTHIRE_APP ?? '').trim()
  if (explicit) {
    if (!(explicit in APPS)) {
      return {
        app: null,
        why: `SMARTHIRE_APP is set to "${explicit}", which is not one of: ${Object.keys(APPS).join(', ')}`,
      }
    }
    return { app: explicit, how: `SMARTHIRE_APP=${explicit}` }
  }

  /*
    FALLBACK, and it exists for exactly one reason: so that committing this
    change does not take all three projects down until someone opens the
    dashboard. VERCEL_URL is always `<project>-<hash>-<scope>.vercel.app` — it is
    the deployment's own hostname, so unlike VERCEL_PROJECT_PRODUCTION_URL it
    does not become the custom domain once one is attached. That is why it is
    tried first; the production URL is a second-best that works only before
    `app.<domain>` exists.

    Set SMARTHIRE_APP on each project and this branch stops being reachable.
  */
  const source = env.VERCEL_URL ? 'VERCEL_URL' : 'VERCEL_PROJECT_PRODUCTION_URL'
  const host = env.VERCEL_URL || env.VERCEL_PROJECT_PRODUCTION_URL || ''
  if (host) {
    const prefix = host.split('.')[0].split('-')[0]
    const found = Object.entries(APPS).find(([, a]) => a.project === prefix)
    if (found) {
      return { app: found[0], how: `the Vercel project name "${prefix}", read from ${source}` }
    }
    return {
      app: null,
      why: `SMARTHIRE_APP is not set, and ${source} ("${host}") does not start with any known Vercel project name (${Object.values(APPS).map((a) => a.project).join(', ')})`,
    }
  }

  return {
    app: null,
    why: 'SMARTHIRE_APP is not set, and neither VERCEL_URL nor VERCEL_PROJECT_PRODUCTION_URL is present to fall back on',
  }
}

/** The sentence printed whenever resolution fails. One fix, stated once. */
export const HOW_TO_FIX =
  'Fix: in the Vercel project\'s Settings > Environment Variables, add SMARTHIRE_APP with one of these values ' +
  `(all environments): ${Object.keys(APPS).join(', ')}.`
