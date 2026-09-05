# SmartHire AI

One repo, four apps and three shared packages, one `node_modules`. Managed with
npm workspaces.

```
apps/desktop      Electron + Vite + React 18 interview assistant
apps/marketing    Next.js marketing site — the root domain
apps/dashboard    Next.js + Supabase licensing backend — the app. subdomain,
                  and the only thing apps/desktop talks to
apps/admin        Next.js admin console — the admin. subdomain. Nothing links
                  to it; it is reached by typing the URL
packages/ui       The design system all three Next apps render with, plus base.css
packages/pricing  What we sell and for how much. Zero dependencies, so
                  apps/desktop could consume it without pulling in a React
packages/data     The Supabase clients, the credit meter, the licence. Shared by
                  dashboard and admin, server-only, no root export
```

Every workspace is published under the `@smarthire/` scope — `@smarthire/ui`,
`@smarthire/data`, `@smarthire/pricing` and one per app — so an internal import
is recognisable as internal on sight.

> **RENAME 2026-09-06.** `apps/site` is now `apps/marketing` and `apps/web` is now
> `apps/dashboard`; the `smarthire-*` package names became `@smarthire/*`. The two
> old names differed by one word of meaning and had to be memorised. `apps/admin`
> and `apps/desktop` were already unambiguous and did not move. **The three Vercel
> *projects* are still named `web`, `site` and `admin`** — those names are
> deliberately untouched (see "Deploying"), and renaming the `web` project would
> break every packaged desktop build.

**The splits, in two paragraphs.** `apps/marketing` and `apps/dashboard` were one deployment
until 2026-09-01, which meant a copy tweak on the landing page redeployed the
licensing and payments backend. They are separate now: marketing on the root
domain, the product on `app.`.

`apps/admin` came out of `apps/dashboard` the same week and for the same reason turned
up a notch: the console that grants credits and comps unlimited subscriptions was
sharing a deployment, a build, a rollback and a set of secrets with the app every
paying customer uses. It now holds three Supabase variables and nothing else — no
Stripe, no Razorpay, no model keys — and **you sign in to it separately**, with a
different cookie name, so a dashboard session does not carry over. Nothing about
the desktop app changed through either split: every endpoint and every page it
opens still lives in `apps/dashboard`, on the same Vercel project and the same hostname.

## Setup

Install once from the repo root — never inside `apps/*`, or you break hoisting:

```bash
npm install
```

Then create the two env files (neither is committed):

```bash
cp apps/desktop/.env.example apps/desktop/.env
cp apps/dashboard/.env.local.example apps/dashboard/.env.local
cp apps/marketing/.env.local.example apps/marketing/.env.local
cp apps/admin/.env.local.example apps/admin/.env.local
```

`apps/marketing`'s is three lines and holds no credentials — that deployment has no
Supabase keys, no AI key and no payment secrets, because it asks nobody whether
they are signed in and starts no checkout.

`apps/dashboard/.env.local` needs real Supabase values or `npm run build:dashboard` fails at
the prerender step — the compile itself succeeds, so a build that dies on
`/login` means the env file is missing, not that the code is broken.

## Commands

All run from the repo root.

| Command | What it does |
| --- | --- |
| `npm run dev` | All four apps |
| `npm run dev:front` | Site + web only, which is the usual loop |
| `npm run dev:console` | Web + admin, the loop for admin work |
| `npm run dev:marketing` | Marketing site on :3002 |
| `npm run dev:dashboard` | Next.js dev server on :3000 |
| `npm run dev:admin` | Admin console on :3003 |
| `npm run dev:desktop` | Vite on :5173 + Electron |
| `npm run build` | Desktop renderer bundle |
| `npm run build:marketing` | Marketing site production build |
| `npm run build:dashboard` | Next.js production build |
| `npm run build:admin` | Admin console production build |
| `npm run build:mac` / `build:win` / `build:all` | Packaged desktop installers |

## Releasing the desktop app

Cutting a tag is the whole process. `.github/workflows/release.yml` packages
macOS and Windows on their own runners and attaches both to a GitHub Release:

```sh
npm version --workspace apps/desktop 1.0.1 --no-git-tag-version
git commit -am "Desktop 1.0.1" && git tag v1.0.1 && git push --follow-tags
```

The dashboard picks it up on its own. [apps/dashboard/lib/releases.js](apps/dashboard/lib/releases.js)
reads the release feed and the "Get the app" card turns from its pending state
into download buttons within ten minutes, with no web deploy. The version is
never hardcoded on the web side — that is exactly what went stale last time.

Build locally with `npm run build:mac` when you only need a macOS dmg to test.
Windows cannot be built on a Mac without wine, which is the reason the workflow
exists rather than a local `build:all`.

Two things worth knowing:

- **Builds are unsigned.** There is no Apple Developer certificate, so
  [scripts/afterPack.cjs](apps/desktop/scripts/afterPack.cjs) applies an ad-hoc
  signature — without one, Apple Silicon refuses to launch the app at all. Users
  still get a Gatekeeper warning on first open and have to allow it from System
  Settings › Privacy & Security. To sign properly later, set `mac.identity` and
  `notarize` in [electron-builder.config.cjs](apps/desktop/electron-builder.config.cjs)
  and drop the hook.
- **macOS ships as a dmg only.** The zip target was removed: a zipped `.app`
  runs un-installed from Downloads, which is the worst case for an unsigned
  build. Restore it only alongside auto-update, which needs the zip format and
  is still an empty placeholder in `electron/updater.js`.

The app icon is generated, not committed by hand — `npm run icon --workspace
apps/desktop` regenerates `build/icon.png` from the same mark the web app uses.

## How the two apps talk

The desktop app calls the web app for licensing. It reads `WEB_URL` from
`apps/desktop/.env`, defaulting to the deployed Vercel URL in
[apps/desktop/electron/main.cjs](apps/desktop/electron/main.cjs). Point it at
`http://127.0.0.1:3000` to develop against a local web build — use the IP, not
`localhost`, since Electron's Node resolves `localhost` to IPv6 and will not
fall back.

Endpoints the desktop depends on:

- `POST /api/license/validate` — used on launch and by the desktop's 10-second
  re-validation loop.
- `GET /api/license/stream?licenseKey=…` — Server-Sent Events, consumed by the
  listener in [apps/desktop/src/App.jsx](apps/desktop/src/App.jsx) so a revoked
  license logs the user out without waiting for the next poll.

### How the stream works

The route re-checks the license every 5 seconds and pushes a single
`{ type: 'license_revoked', valid: false, reason }` frame the moment it stops
being valid, then closes. Between checks it sends SSE comment lines, which keep
the connection warm without waking the client's `onmessage`.

Two deliberate choices worth knowing before you change it:

- **The connection closes itself after 50 seconds.** Serverless platforms cap
  function duration, so the stream ends early and `EventSource` reconnects on
  its own. Each new connection re-checks immediately, so nothing is missed.
- **A database error never emits `valid: false`.** The client logs the user out
  on that field, so a transient Supabase outage would otherwise kick out every
  paying customer at once. Failed checks emit a comment and the loop continues.

`Access-Control-Allow-Origin` is `*` because the packaged renderer connects from
`file://` (origin `null`). `EventSource` sends no credentials, and the caller
already holds the license key, so this exposes nothing new.

## Deploying

Three Vercel projects from one repo. All leave **Root Directory** empty (the repo
root) — pointing it at `apps/*` fails to install the hoisted dependencies.

| | project `web` | project `site` | project `admin` |
| --- | --- | --- | --- |
| Build command | `npm run build:dashboard` | `npm run build:marketing` | `npm run build:admin` |
| Output | `apps/dashboard/.next` | `apps/marketing/.next` | `apps/admin/.next` |
| Domains | the existing `*.vercel.app`, plus `app.<domain>` | `<domain>` and `www` | `admin.<domain>` |

The project names `web` and `site` are Vercel's, not this repo's, and the
2026-09-06 rename left them alone on purpose — the `web` project in particular
must never be renamed (see two paragraphs down). The **settings inside those two
projects are what the rename invalidated**, and the dashboard is the only place
they can be fixed:

- **Build command** — `npm run build:web` and `npm run build:site` no longer
  exist. They are `build:dashboard` and `build:marketing` now. A stale one fails
  the deploy loudly, which is the harmless half.
- **Ignored Build Step** — the two `git diff` lines below still name `apps/web`
  and `apps/site` in those projects. This is the half that fails *silently*: a
  path that matches nothing always diffs clean, `git diff --quiet` exits 0,
  Vercel reads 0 as *skip*, and both projects quietly stop deploying on every
  push while still reporting success. Repaste the lines below.

The `admin` project is a **third, brand-new project**. Neither existing one may
be reused or renamed into it — see the paragraph below.

**The `web` project must never be renamed, deleted, transferred or repurposed.**
Its `*.vercel.app` hostname is baked into every packaged desktop build and there
is no auto-updater to re-point them. That exact mistake was made once already —
the note above `WEB_URL` in `apps/desktop/electron/main.cjs` is the account of
it. The marketing site gets a NEW project; do not give it this one.

Set an **Ignored Build Step** on all three, or every push redeploys everything
and a marketing typo becomes a production deploy of the payment system:

```sh
# web
git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" "$VERCEL_GIT_COMMIT_SHA" -- apps/dashboard packages package.json package-lock.json || exit 1
# site
git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" "$VERCEL_GIT_COMMIT_SHA" -- apps/marketing packages package.json package-lock.json || exit 1
# admin
git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" "$VERCEL_GIT_COMMIT_SHA" -- apps/admin packages package.json package-lock.json || exit 1
```

(Vercel treats exit 0 as *skip*, which is why `git diff --quiet` has the right
polarity. The `|| exit 1` covers a shallow clone with no previous SHA.)

**`packages` is not optional in any of them.** Leave it out of the admin rule and
a fix to `packages/data` — the auth gate, the credit meter — deploys to the app
and not to the console, which then runs old money-moving code with no signal that
anything is stale.

### The admin project, specifically

Its environment is **exactly** `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally
`NEXT_PUBLIC_APP_URL`. No Stripe, no Razorpay, no webhook secrets, no model keys.
That shortness is the security argument for the split, so treat any addition as a
decision rather than a convenience.

**Scope `SUPABASE_SERVICE_ROLE_KEY` to Production only.** Vercel injects project
variables into every preview build, so otherwise each PR touching `apps/admin`
mints a `*.vercel.app` host holding a key that bypasses RLS on every table — and
`*.vercel.app` is on the Public Suffix List, so those previews cannot be cookie
isolated from one another. Nobody previews the admin UI against production data
on purpose; let it fail loudly.

Sign-in is **email and password only**, so Supabase's Auth URL configuration needs
no change. The consequence: an admin whose account was created through Google has
no password, and this repo has no reset route — set one for each admin from the
Supabase dashboard before the console goes live.

**Break glass.** If the console is ever down mid-deploy, every operation it
performs is a `security definer` RPC callable from the Supabase SQL editor with
the service-role key: `credit_grant(...)`, `subscription_set(...)` and
`profile_set_role(...)`. A subscription comped that way is recorded in
`subscription_events` identically to one comped through the UI.

`NEXT_PUBLIC_APP_URL` on the site project must be present **at build time**, not
only at runtime: `/features` and `/how-it-works` are statically prerendered and
bake it into their HTML, while `/` and `/pricing` read it per request. Set it
only at runtime and two of five pages ship pointing at localhost while the other
three look fine, with nothing erroring.

Do not add a redirect from the old `*.vercel.app` host to `app.<domain>`. Both
serving 200 costs nothing, and every installed desktop build polls that host
every ten seconds.

## Version note

The two apps intentionally sit on different majors: desktop on React 18 +
Tailwind 3, web on React 19 + Tailwind 4. npm hoists one copy of each to the
root and nests the other under the app that needs it — currently React 19 at the
root with React 18 nested under `apps/desktop/node_modules`, and Tailwind 3 at
the root with Tailwind 4 nested under `apps/dashboard/node_modules`.

Which copy wins the root is an npm implementation detail that flips depending on
what the root `package.json` itself declares; both apps resolve their correct
major either way. Do not "fix" this by aligning the versions.
