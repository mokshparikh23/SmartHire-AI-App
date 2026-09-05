#!/usr/bin/env node
/**
 * HARDENED 2026-09-06 ─ the repo's own rules, made executable.
 *
 * Every check below already existed as prose somewhere in this repo, usually
 * with the verifying command written out beside it — packages/data's
 * _comment_no_root_export literally ends "the phase gate is: grep '\".\"'
 * packages/data/package.json must return nothing", and _comment_desktop names
 * its own "review tripwire". Nothing ran them. A rule that is only a paragraph
 * is a rule that survives exactly as long as the next person who reads the
 * paragraph, and the boundaries these guard — a service-role key reaching a
 * browser bundle, a second React landing in the Electron tree — are not the
 * kind you find out about from a green build.
 *
 * Each check states what it protects and what breaking it would actually cost,
 * because a failure here should not send anyone hunting for the reason.
 *
 *   node scripts/check-invariants.mjs
 *
 * Exit 0 = every invariant holds. Exit 1 = at least one is broken.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const json = (p) => JSON.parse(read(p))

const results = []
/** @param {string} name @param {string} why @param {() => string|null} run */
function check (name, why, run) {
  let failure = null
  try {
    failure = run()
  } catch (err) {
    failure = `check itself threw: ${err.message}`
  }
  results.push({ name, why, failure })
}

// ── every .js/.jsx/.mjs/.cjs file we own, for the import scans ───────────────
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'out', 'release', 'release.noindex'])
function sourceFiles (dir = root, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) sourceFiles(path, acc)
    else if (/\.(js|jsx|mjs|cjs)$/.test(entry)) acc.push(path)
  }
  return acc
}
const FILES = sourceFiles()

// ────────────────────────────────────────────────────────────────────────────

check(
  'packages/data has no "." export',
  'A root barrel puts next/headers and the SUPABASE_SERVICE_ROLE_KEY factory on the import graph of every client component that only wanted formatBalance(). credits.js is imported by three "use client" files, so this is not hypothetical.',
  () => {
    const exports = json('packages/data/package.json').exports ?? {}
    return '.' in exports
      ? 'packages/data/package.json declares a "." export. Remove it — subpaths only.'
      : null
  },
)

check(
  'packages/ui root export has no "use client"',
  'The root export is Container, Button, Card and Badge. A directive there turns all of them into client components at every call site in both Next apps — the components that carry it get their own subpath entry instead.',
  () => {
    const src = read('packages/ui/src/index.jsx')
    // Only a directive in the prologue counts; the string inside a comment or a
    // nested component does not make the module a client module.
    const prologue = src.split('\n').slice(0, 5).join('\n')
    return /^\s*['"]use client['"]/m.test(prologue)
      ? 'packages/ui/src/index.jsx has gained a "use client" directive. Give the component its own subpath export instead.'
      : null
  },
)

check(
  'apps/desktop depends on no @smarthire/* workspace',
  'Four of @smarthire/data\'s six subpaths import next/* and would fail loudly at Vite resolve, but ./credits and ./next-url import nothing and link cleanly. Merely LISTING it resolves its react ^19 peer beside desktop\'s pinned 18, with no ERESOLVE to rely on.',
  () => {
    const pkg = json('apps/desktop/package.json')
    const named = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ].filter((d) => d.startsWith('@smarthire/'))
    return named.length
      ? `apps/desktop/package.json depends on ${named.join(', ')}. The desktop app must stay outside the workspace graph.`
      : null
  },
)

check(
  'apps/desktop resolves React 18',
  'React 18.3.1 and Tailwind 3 are pinned in the desktop app deliberately. A React 19 hoisted over it is the failure this pin exists to prevent, and it does not announce itself.',
  () => {
    const declared = json('apps/desktop/package.json').dependencies?.react ?? ''
    if (!declared.includes('18')) {
      return `apps/desktop declares react "${declared}" — the pin is 18.x.`
    }
    // The declared range is only half of it; what actually got installed is the
    // half that bites. Skipped rather than failed when nothing is installed, so
    // this script still runs useful checks before the first npm install.
    const installed = 'apps/desktop/node_modules/react/package.json'
    if (!existsSync(join(root, installed))) return null
    const version = json(installed).version
    return version.startsWith('18.')
      ? null
      : `apps/desktop/node_modules/react is ${version}, not 18.x.`
  },
)

check(
  'apps/marketing reaches no database',
  'The marketing deployment holds no Supabase keys on purpose: it is the surface with the largest blast radius and the least need for credentials. A @smarthire/data import is how it would acquire them.',
  () => {
    const pkg = json('apps/marketing/package.json')
    const deps = Object.keys(pkg.dependencies ?? {})
    const bad = deps.filter((d) => d === '@smarthire/data' || d.startsWith('@supabase/'))
    if (bad.length) return `apps/marketing depends on ${bad.join(', ')}.`
    const leaks = FILES
      .filter((f) => f.startsWith(join(root, 'apps/marketing')))
      .filter((f) => /SUPABASE_SERVICE_ROLE_KEY|@smarthire\/data/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f))
    return leaks.length
      ? `apps/marketing reads Supabase credentials in: ${leaks.join(', ')}`
      : null
  },
)

check(
  'every workspace directory is a declared workspace',
  'apps/* is NOT globbed in the root package.json — each app is listed by hand. A directory that is missing from that list gets nothing linked into its node_modules, and the failure surfaces as a broken npm script rather than as a missing workspace.',
  () => {
    const declared = new Set(json('package.json').workspaces)
    const onDisk = ['apps', 'packages'].flatMap((parent) =>
      readdirSync(join(root, parent))
        .filter((d) => existsSync(join(root, parent, d, 'package.json')))
        .map((d) => `${parent}/${d}`))
    const missing = onDisk.filter((d) =>
      !declared.has(d) && !declared.has(`${d.split('/')[0]}/*`))
    return missing.length
      ? `these have a package.json but are not in root "workspaces": ${missing.join(', ')}`
      : null
  },
)

check(
  'every @smarthire/* import resolves to a declared export',
  'These packages have no build step and no types, so a subpath that stops existing — renamed file, edited exports map — is not caught until the bundler reaches that import. This is the check that a directory rename can fail loudly on.',
  () => {
    // Discovered from disk rather than listed here. The first version of this
    // check hardcoded the seven workspaces that existed the day it was written
    // and then failed on packages/config the moment it was added — correctly, but
    // for the wrong reason, reporting a real package as nonexistent.
    const packages = {}
    for (const parent of ['apps', 'packages']) {
      for (const entry of readdirSync(join(root, parent))) {
        const dir = `${parent}/${entry}`
        if (!existsSync(join(root, dir, 'package.json'))) continue
        const pkg = json(`${dir}/package.json`)
        packages[pkg.name] = { dir, exports: pkg.exports ?? null }
      }
    }
    const bad = []
    for (const file of FILES) {
      const src = readFileSync(file, 'utf8')
      for (const [, spec] of src.matchAll(/from\s+['"](@smarthire\/[^'"]+)['"]/g)) {
        const [scope, name, ...rest] = spec.split('/')
        const pkgName = `${scope}/${name}`
        const target = packages[pkgName]
        if (!target) { bad.push(`${relative(root, file)}: no workspace named ${pkgName}`); continue }
        if (!target.exports) continue // no exports map = everything is reachable
        const subpath = rest.length ? `./${rest.join('/')}` : '.'
        if (!(subpath in target.exports)) {
          bad.push(`${relative(root, file)}: ${pkgName} declares no "${subpath}" export`)
          continue
        }
        const file_ = target.exports[subpath]
        if (!existsSync(join(root, target.dir, file_))) {
          bad.push(`${relative(root, file)}: ${spec} points at ${target.dir}/${file_}, which does not exist`)
        }
      }
    }
    return bad.length ? bad.join('\n      ') : null
  },
)

/*
  Loaded up front because check() is synchronous.

  Imported as data: URLs rather than by path, and that is not fussiness. Neither
  app declares "type": "module" — they cannot, because that would change how Next
  treats every other .js file in them — so importing these by path makes Node
  reparse them and warn on every run. Both files are plain ESM with no imports at
  all (auth-cookie.js says why: it must not drag @supabase/ssr's browser client
  into the server graph), so their source stands alone as a module.
*/
const loadCookieModule = (path) =>
  import(`data:text/javascript,${encodeURIComponent(read(path))}`)

const cookieModules = await Promise.all([
  loadCookieModule('apps/admin/lib/auth-cookie.js'),
  loadCookieModule('apps/dashboard/lib/auth-cookie.js'),
])

check(
  'the admin and dashboard auth cookies cannot match each other',
  'Cookies ignore ports, so in development the two apps share one jar. If either pattern matched the other app\'s cookie, a request with no session of its own would find the neighbour\'s, and the bug would be invisible in production where the jars are separate — on the one origin whose sign-in path is hardest to exercise.',
  () => {
    const [admin, dashboard] = cookieModules
    const problems = []

    // The two patterns must not be the same regex.
    if (String(admin.AUTH_COOKIE) === String(dashboard.AUTH_COOKIE)) {
      problems.push('both apps use the identical AUTH_COOKIE pattern')
    }

    // The dashboard's pattern must not fire on the admin cookie, chunks included.
    for (const name of [admin.AUTH_STORAGE_KEY, `${admin.AUTH_STORAGE_KEY}.0`]) {
      if (dashboard.AUTH_COOKIE.test(name)) {
        problems.push(`the dashboard pattern matches the admin cookie "${name}"`)
      }
    }

    /*
      And the admin's must not fire on a real @supabase/ssr cookie. The note in
      apps/admin/lib/auth-cookie.js explains why the name does not start with
      `sb-`: an sb- prefixed name would match the dashboard's pattern in
      development, so its optimistic gate would see a cookie it cannot use, build
      a client, get null from getSession() and bounce to /login.
    */
    for (const name of ['sb-abcdefghijklm-auth-token', 'sb-abcdefghijklm-auth-token.1']) {
      if (admin.AUTH_COOKIE.test(name)) {
        problems.push(`the admin pattern matches a Supabase cookie "${name}"`)
      }
    }

    // The chunk suffix is "the part that gets dropped when someone retypes this
    // from memory", and dropping it leaves the halves of a large session
    // surviving every attempt to clear it.
    if (!admin.AUTH_COOKIE.test(`${admin.AUTH_STORAGE_KEY}.0`)) {
      problems.push('the admin pattern does not match its own chunked cookie (.0/.1)')
    }
    if (!dashboard.AUTH_COOKIE.test('sb-abcdefghijklm-auth-token.0')) {
      problems.push('the dashboard pattern does not match a chunked Supabase cookie (.0/.1)')
    }

    return problems.length ? problems.join('; ') : null
  },
)

check(
  'no .env file is tracked by git',
  'apps/admin holds SUPABASE_SERVICE_ROLE_KEY. Until 2026-09-06 the root .gitignore covered only .env and .env.local, so apps/admin/.env.production was a file waiting for someone to type `git add -A`.',
  () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter((f) => /(^|\/)\.env/.test(f))
      .filter((f) => !f.endsWith('.example'))
    return tracked.length
      ? `these are committed and should not be: ${tracked.join(', ')}`
      : null
  },
)

// ────────────────────────────────────────────────────────────────────────────

const failed = results.filter((r) => r.failure)
for (const { name, failure } of results) {
  console.log(`${failure ? '✗' : '✓'} ${name}`)
}
if (failed.length) {
  console.error(`\n${failed.length} of ${results.length} invariants broken:\n`)
  for (const { name, why, failure } of failed) {
    console.error(`  ✗ ${name}`)
    console.error(`      ${failure}`)
    console.error(`      why it matters: ${why}\n`)
  }
  process.exit(1)
}
console.log(`\nAll ${results.length} invariants hold.`)
