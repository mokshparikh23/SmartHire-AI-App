// The lint rules for a library package in this repo: packages/ui,
// packages/data and packages/pricing.
//
// HARDENED 2026-09-06 ─ until now these three had no eslint config, no scripts
// and no types, so nothing in them was ever checked. They hold the auth
// primitives, the credit meter and the price table — the code with the most
// reach and the least oversight in the repo. That is the wrong way round.
//
// The Next preset is deliberately NOT used here. It assumes an app: a pages or
// app directory, a next build to hang the config off. These packages have no
// build step at all — the consuming app's compiler is what turns them into a
// bundle — so this is the core JS rule set plus the React hooks rules that
// packages/ui actually needs.
import { defineConfig, globalIgnores } from 'eslint/config'
import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default defineConfig([
  globalIgnores(['**/node_modules/**', '**/dist/**']),

  {
    files: ['**/*.{js,jsx,mjs}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      // These run in a Next server runtime and in the browser, depending on the
      // subpath — packages/data's ./credits is client-safe by design and its
      // ./supabase-server is not. Declaring both keeps no-undef useful without
      // it firing on `process` in one file and `window` in another.
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Unused function arguments are frequently a signature being honoured
      // (a callback that ignores its second parameter), so only unused
      // *variables* are worth failing on. A leading underscore opts out.
      'no-unused-vars': ['error', {
        args: 'none',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
    },
  },

  // packages/ui is the only one with components in it.
  {
    files: ['**/*.jsx'],
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // WITHOUT THIS, no-unused-vars IS WRONG IN EVERY JSX FILE. The core rule
      // does not treat `<Icon />` as a use of `Icon`, so the first run of this
      // config reported 17 unused variables in packages/ui and all 17 were
      // false — imported components, and `const Tag = as || 'div'` used one
      // line later as <Tag>. This rule is what marks a JSX-referenced binding
      // as read. It is not optional; it is the price of linting JSX at all.
      'react/jsx-uses-vars': 'error',
    },
  },

  // ── BASELINE ──────────────────────────────────────────────────────────────
  // Same contract as the app baseline in ./eslint-next.mjs: an exact file and
  // an exact rule, not a severity downgrade, so anything new still fails.
  //
  // react-hooks/immutability fires twice in PricingPlans.jsx on
  // `window.location.href = <url>`, once for the plan handoff to the app origin
  // and once after a checkout session is created. Neither is the mutation the
  // rule is looking for — they are navigations. The clean fix is
  // `window.location.assign(url)`, which is exactly equivalent (same navigation,
  // same history entry) and is a method call rather than an assignment, so the
  // rule stops firing. That edit is deliberately NOT being made in the commit
  // that first turns linting on: it is a two-line change inside the checkout
  // path, and it should be reviewed as a change to the checkout path.
  {
    files: ['src/PricingPlans.jsx'],
    rules: { 'react-hooks/immutability': 'off' },
  },
])
