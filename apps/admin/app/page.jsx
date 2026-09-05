import { Container } from 'smarthire-ui'
import Icon, { Logo } from 'smarthire-ui/Icon'
import { requireAdminPage } from '@/lib/auth'
import SignOutButton from '@/components/SignOutButton'

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
export default async function Placeholder() {
  /*
    ADMIN SPLIT 2026-09-01 ─ the gate, added with the auth surface.

    It is on the placeholder deliberately: until the console moves in, this page
    IS the proof that the gate works end to end. Signed out it must reach /login;
    signed in as a non-admin it must reach the 403; and — the assertion the whole
    split rests on — a browser already signed in at localhost:3000 must still be
    asked to sign in here, because the two apps write differently named cookies.
  */
  const profile = await requireAdminPage()

  return (
    <Container className="flex min-h-screen flex-col items-center justify-center text-center">
      <Logo size={44} />

      <h1 className="display mt-8 text-[2.5rem] text-ink">Admin</h1>

      <p className="mono mt-3 text-[12px] uppercase tracking-[0.19em] text-faint">
        smarthire-admin · port 3003
      </p>

      <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-muted">
        Signed in as <span className="font-medium text-ink">{profile?.email}</span>.
        The console itself moves onto this origin in the commit that takes it out
        of the app.
      </p>

      <p className="mt-10 flex items-center gap-2 text-[13px] text-faint">
        <Icon name="lock" size={14} />
        This deployment holds no payment or model credentials.
      </p>

      <div className="mt-8 w-full max-w-[200px]">
        <SignOutButton className="justify-center border border-line !text-ink-soft" />
      </div>
    </Container>
  )
}
