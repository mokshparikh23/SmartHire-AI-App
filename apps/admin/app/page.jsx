import { Container } from 'smarthire-ui'
import Icon, { Logo } from 'smarthire-ui/Icon'

/*
  ADMIN SPLIT 2026-09-01 ─ A PLACEHOLDER, AND IT IS TEMPORARY BY DESIGN.

  This file is deleted — genuinely deleted, `git rm`, not commented out — in the
  commit that moves the admin pages in. It is the one file the repo's
  comment-out-never-delete convention does not cover, because by then `/` is a
  redirect to /admin and Next cannot have a page and a redirect claiming one path.

  Until then its whole job is to fail loudly if the environment is wrong, which is
  what the a5a3f94 commit did for apps/site. Three things it proves:

    1. THE FONTS ARRIVED. The heading uses .display and the line under it uses
       .mono, both from packages/ui/src/styles/base.css. If next/font's variable
       names collided with the @theme tokens, this renders in Times — which is
       the failure apps/web/app/layout.js documents at length.

    2. TAILWIND REACHED INTO packages/ui. base.css carries an @source glob
       covering the package's own JSX, because Tailwind v4 roots its scan at cwd
       — and if that does not resolve from THIS app the build still succeeds and
       ships an unstyled page. The check does not need this file's help; the
       utility lives in the package and Tailwind emits what it scans:

           grep -c 'translate-x-\[3px\]' apps/admin/.next/static/css/*.css

       must be at least 1. That string appears only in
       packages/ui/src/PricingPlans.jsx, which nothing here imports, so finding
       it in this app's CSS can only mean the @source glob resolved.

    3. THE PACKAGE IMPORTS RESOLVE at all — Container from the root export,
       Icon and Logo from the subpath, which is the split that keeps 'use client'
       off the root.
*/
export default function Placeholder() {
  return (
    <Container className="flex min-h-screen flex-col items-center justify-center text-center">
      <Logo size={44} />

      <h1 className="display mt-8 text-[2.5rem] text-ink">Admin</h1>

      <p className="mono mt-3 text-[12px] uppercase tracking-[0.19em] text-faint">
        smarthire-admin · port 3003
      </p>

      <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-muted">
        Nothing is here yet. The console moves onto this origin in the commit that
        takes it out of the app.
      </p>

      <p className="mt-10 flex items-center gap-2 text-[13px] text-faint">
        <Icon name="lock" size={14} />
        This deployment holds no payment or model credentials.
      </p>
    </Container>
  )
}
