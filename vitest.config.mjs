/*
  HARDENED 2026-09-06 ─ the first tests in this repo.
  213 source files, 0 test files, and the untested set included the Stripe and
  Razorpay webhooks, the credit meter and the entitlement gate.

  ONE CONFIG AT THE ROOT, NOT ONE PER WORKSPACE. The alternative is four configs
  that drift, which is the same mistake the three copied eslint configs were.
  Tests live beside the code they cover, as *.test.js.

  WHAT IS TESTED AND WHAT IS NOT. Everything here is a pure unit test with no
  database and no network. That is a deliberate ceiling, not an accident: the
  functions in @smarthire/data/metering are thin wrappers over SECURITY DEFINER
  Postgres functions, and the real logic — the row lock, the clamp at zero, the
  last-admin guard — lives in SQL that only a live database can exercise. So the
  tests below assert the half that JavaScript owns: that the right RPC is called
  with the right argument names, that a transport error throws rather than being
  read as a verdict, and that every pure calculation is correct at its edges.
  Testing the SQL needs a Supabase instance in CI and is its own piece of work.
*/
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['{apps,packages}/*/**/*.test.{js,jsx,mjs}'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
    environment: 'node',
    // A test that passes because it silently skipped is worse than no test.
    passWithNoTests: false,
  },
})
