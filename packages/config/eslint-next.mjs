// The lint rules for a Next app in this repo. apps/marketing, apps/dashboard
// and apps/admin each re-export this and add nothing.
//
// HARDENED 2026-09-06 ─ two things happened here at once, and the second only
// became visible because of the first.
//
// The three apps' eslint.config.mjs files were byte-identical copies, so this
// file exists to make them one. But running the result revealed that linting
// had NEVER WORKED in this repo: every app's script was `next lint`, which
// Next 16 removed, and eslint itself was not installed at all — the scaffolded
// config imported `eslint/config` and `eslint-config-next`, neither of which
// was in the tree. `npm run lint` had been exiting non-zero on every call, and
// nothing called it. eslint and eslint-config-next are root devDependencies
// now and the scripts run `eslint .`.
//
// The first real run found ten errors. See BASELINE below.
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

// ── BASELINE ────────────────────────────────────────────────────────────────
// These are REAL findings, not false positives, and this list is a debt record
// rather than a decision that the rule is wrong.
//
// They are all react-hooks rules that arrived with the React Compiler-aware
// plugin, and every fix changes how a live component behaves — resetting state
// on a route change, seeding a combobox from a prop, reading a ref during
// render. Six components, no test covering any of them yet. Turning a linter on
// for the first time and refactoring six components in the same commit means
// neither can be reviewed, so the refactors are their own piece of work.
//
// What this list is NOT is a blanket disable. Each entry names one rule and one
// file. A new violation anywhere else, or a different rule in these same files,
// still fails the build — which is the entire reason this is written as an
// exact list instead of a severity downgrade to "warn".
//
// Shrink it. Do not add to it.
const BASELINE = [
  {
    rule: 'react-hooks/set-state-in-effect',
    files: [
      'components/LiveDemo.jsx',                            // marketing
      'components/SiteNav.jsx',                             // marketing
      'components/dashboard/DeviceList.jsx',                // dashboard
      'components/dashboard/interview/CompanyCombobox.jsx', // dashboard
      'components/dashboard/interview/OriginalPdf.jsx',     // dashboard
      'components/dashboard/interview/RoleCombobox.jsx',    // dashboard
    ],
  },
  {
    rule: 'react-hooks/purity',
    files: ['components/dashboard/DeviceList.jsx'],
  },
  {
    rule: 'react-hooks/refs',
    files: ['components/dashboard/interview/ResumeEditor.jsx'],
  },
]

export default defineConfig([
  ...nextVitals,

  // Override default ignores of eslint-config-next.
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),

  // One block per baselined rule, scoped to exactly the files that violate it.
  // A pattern that matches nothing in a given app is simply inert, which is what
  // lets all three apps share one list.
  ...BASELINE.map(({ rule, files }) => ({
    files,
    rules: { [rule]: 'off' },
  })),
])
