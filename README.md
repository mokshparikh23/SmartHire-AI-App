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

## How the two apps talk

The desktop app calls the web app for licensing. It reads `WEB_URL` from
`apps/desktop/.env`, defaulting to the deployed Vercel URL in
[apps/desktop/electron/main.cjs](apps/desktop/electron/main.cjs). Point it at
`http://127.0.0.1:3000` to develop against a local web build — use the IP, not
`localhost`, since Electron's Node resolves `localhost` to IPv6 and will not
fall back.

Endpoints the desktop depends on:

- `POST /api/license/validate` — implemented, used on launch and by the periodic
  re-validation loop.
- `GET /api/license/stream` — **not implemented.** The SSE listener in
  [apps/desktop/src/App.jsx](apps/desktop/src/App.jsx) expects it for instant
  revocation. Its `onerror` is a no-op, so the app silently falls back to
  polling; revocation just takes until the next poll instead of being instant.

## Deploying the web app

The build must run from the repo root so workspaces resolve. `netlify.toml` at
the root already does this. On Vercel, leave **Root Directory** empty (repo
root) and set the build command to `npm run build:web` with output
`apps/web/.next` — pointing Root Directory at `apps/web` will fail to install
the hoisted dependencies.

## Version note

The two apps intentionally sit on different majors: desktop on React 18 +
Tailwind 3, web on React 19 + Tailwind 4. npm hoists React 18 and Tailwind 3 to
the root and nests the web's copies under `apps/web/node_modules`. This is
correct — do not "fix" it by aligning the versions.
