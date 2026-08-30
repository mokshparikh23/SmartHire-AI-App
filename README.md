# SmartHire AI

One repo, two apps, one `node_modules`. Managed with npm workspaces.

```
apps/desktop    Electron + Vite + React 18 interview assistant
apps/web        Next.js + Supabase licensing backend and admin dashboard
```

## Setup

Install once from the repo root — never inside `apps/*`, or you break hoisting:

```bash
npm install
```

Then create the two env files (neither is committed):

```bash
cp apps/desktop/.env.example apps/desktop/.env
cp apps/web/.env.local.example apps/web/.env.local
```

`apps/web/.env.local` needs real Supabase values or `npm run build:web` fails at
the prerender step — the compile itself succeeds, so a build that dies on
`/login` means the env file is missing, not that the code is broken.

## Commands

All run from the repo root.

| Command | What it does |
| --- | --- |
| `npm run dev` | Web and desktop together |
| `npm run dev:web` | Next.js dev server on :3000 |
| `npm run dev:desktop` | Vite on :5173 + Electron |
| `npm run build` | Desktop renderer bundle |
| `npm run build:web` | Next.js production build |
| `npm run build:mac` / `build:win` / `build:all` | Packaged desktop installers |

## Releasing the desktop app

Cutting a tag is the whole process. `.github/workflows/release.yml` packages
macOS and Windows on their own runners and attaches both to a GitHub Release:

```sh
npm version --workspace apps/desktop 1.0.1 --no-git-tag-version
git commit -am "Desktop 1.0.1" && git tag v1.0.1 && git push --follow-tags
```

The dashboard picks it up on its own. [apps/web/lib/releases.js](apps/web/lib/releases.js)
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

## Deploying the web app

The build must run from the repo root so workspaces resolve. `netlify.toml` at
the root already does this. On Vercel, leave **Root Directory** empty (repo
root) and set the build command to `npm run build:web` with output
`apps/web/.next` — pointing Root Directory at `apps/web` will fail to install
the hoisted dependencies.

## Version note

The two apps intentionally sit on different majors: desktop on React 18 +
Tailwind 3, web on React 19 + Tailwind 4. npm hoists one copy of each to the
root and nests the other under the app that needs it — currently React 19 at the
root with React 18 nested under `apps/desktop/node_modules`, and Tailwind 3 at
the root with Tailwind 4 nested under `apps/web/node_modules`.

Which copy wins the root is an npm implementation detail that flips depending on
what the root `package.json` itself declares; both apps resolve their correct
major either way. Do not "fix" this by aligning the versions.
