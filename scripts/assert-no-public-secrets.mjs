#!/usr/bin/env node
/**
 * KEY-SHAPE 2026-09-06 ─ the build gate that actually stops a secret shipping.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE RUNTIME ASSERT. packages/data's
 * assertPublishableKey() guards the call that builds a Supabase browser client,
 * and that was the obvious place to stop this. It is not sufficient, and the
 * measurement is worth recording rather than rediscovering:
 *
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_secret_PROBE npm run build:admin
 *     → BUILD: SUCCEEDED
 *     → the probe string present in .next/static/chunks/*.js
 *
 * Next inlines a NEXT_PUBLIC_ value everywhere the source MENTIONS it, at
 * compile time. Whether the code that reads it ever runs is irrelevant — and in
 * the admin console createClient() is only ever called from the sign-in submit
 * handler, so nothing during the build touches it. The assert throws for a
 * visitor, long after the key has been published. It defends the wrong end.
 *
 * So the gate runs around `next build` instead, in two passes:
 *
 *   env     before the build, on process.env. Fails with the variable's name,
 *           which is the whole fix, before a bundle exists at all.
 *   bundle  after the build, on the emitted client chunks. Catches what the
 *           first pass cannot: a secret arriving under a variable this script
 *           has never heard of, or hardcoded in a source file.
 *
 * The second pass is the one that holds when someone invents a new variable.
 * The first is the one that gives a usable error message. Neither replaces the
 * other.
 *
 *   node scripts/assert-no-public-secrets.mjs env
 *   node scripts/assert-no-public-secrets.mjs bundle .next/static
 *
 * Exit 0 = nothing secret is exposed. Exit 1 = stop, and rotate the key if the
 * build it came from was ever deployed.
 */
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isSecretKey } from '../packages/data/src/public-key.js'

const [mode, target] = process.argv.slice(2)

const die = (lines) => {
  console.error('\n  ✗ a secret key is about to be published\n')
  for (const l of lines) console.error(`    ${l}`)
  console.error('\n    NEXT_PUBLIC_* values are inlined into the browser bundle at build time.')
  console.error('    Use the publishable (sb_publishable_…) key for the anon variable and keep')
  console.error('    the secret one in SUPABASE_SERVICE_ROLE_KEY, server-side only.')
  console.error('    If a build carrying this key was already deployed, ROTATE IT FIRST.\n')
  process.exit(1)
}

if (mode === 'env') {
  const bad = Object.entries(process.env)
    .filter(([name, value]) => name.startsWith('NEXT_PUBLIC_') && isSecretKey(value))
    .map(([name]) => `${name} holds a secret key`)
  if (bad.length) die(bad)
  console.log('✓ no NEXT_PUBLIC_ variable holds a secret key')
} else if (mode === 'bundle') {
  if (!target) {
    console.error('usage: assert-no-public-secrets.mjs bundle <dir>')
    process.exit(2)
  }
  /*
    Scanned as text rather than parsed. The value is a string literal in minified
    JavaScript, and the only thing that matters is whether the bytes are present
    in something a browser can download.
  */
  const hits = []
  const walk = (dir) => {
    let entries
    try { entries = readdirSync(dir) } catch { return } // no build output = nothing to check
    for (const entry of entries) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) { walk(path); continue }
      if (!/\.(js|json|txt|map|html)$/.test(entry)) continue
      const src = readFileSync(path, 'utf8')
      for (const [, found] of src.matchAll(/(sb_secret_[A-Za-z0-9_-]+)/g)) {
        hits.push(`${path} contains ${found.slice(0, 18)}…`)
      }
      // Legacy service_role JWTs, which have no distinguishing prefix.
      for (const [, found] of src.matchAll(/(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+)/g)) {
        if (isSecretKey(found)) hits.push(`${path} contains a service_role JWT`)
      }
    }
  }
  walk(target)
  if (hits.length) die([...new Set(hits)])
  console.log(`✓ no secret key in ${target}`)
} else {
  console.error('usage: assert-no-public-secrets.mjs env | bundle <dir>')
  process.exit(2)
}
