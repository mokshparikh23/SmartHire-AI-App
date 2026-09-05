import { redirect } from 'next/navigation'
import { Container, Button } from 'smarthire-ui'
import Icon, { Logo } from 'smarthire-ui/Icon'
import { safeNext } from 'smarthire-data/next-url'
import { getUser, getAdminProfile } from '@/lib/auth'
import { DASHBOARD } from '@/lib/app-links'
import AdminAuthForm from '@/components/AdminAuthForm'
import SignOutButton from '@/components/SignOutButton'

export const metadata = {
  title: 'Sign in — Admin',
  robots: { index: false, follow: false },
}

/**
 * ADMIN SPLIT 2026-09-01 ─ A SERVER COMPONENT, AND IT DOES NOT AUTO-BOUNCE.
 *
 * apps/web handles this in proxy.js: `session && AUTH_PAGES.includes(path)`
 * sends an already-signed-in visitor to /dashboard. That cannot be ported,
 * because a proxy can only know a SESSION exists — knowing whether it is an
 * ADMIN session takes a database read, which an optimistic gate must not do. A
 * blind bounce would therefore push a signed-in NON-admin off this form and
 * straight into the 403, with no way back to sign in as somebody else. On an
 * origin where the whole point is that you may hold two different sessions in
 * one browser, that is the one thing the form must never do.
 *
 * So the decision is made here, where the role is affordable:
 *
 *   no session      render the form
 *   admin           straight through to where they were going
 *   not an admin    say so, and offer a way out that is not the 403
 *
 * getUser() rather than requireUser(): requireUser() redirects to this very
 * page, which would be a loop.
 *
 * A consequence worth knowing: reading cookies makes this route dynamic, so
 * NEXT_PUBLIC_SUPABASE_URL and the anon key are resolved per request rather than
 * baked into a prerender. The build-time rule for NEXT_PUBLIC_ still holds
 * everywhere else, but the failure it guards against cannot bite this page.
 */
export default async function LoginPage({ searchParams }) {
  const params = await searchParams
  const next = safeNext(params?.next)

  const user = await getUser()

  if (user) {
    const profile = await getAdminProfile()
    if (profile?.role === 'admin') redirect(next || '/')

    return (
      <Shell>
        <span className="eyebrow mb-5 block">Signed in</span>
        <h1 className="hl text-[1.75rem] text-ink">Not an administrator</h1>
        <p className="mt-4 text-[14px] leading-relaxed text-muted">
          You are signed in as <span className="font-medium text-ink">{user.email}</span>, and
          that account does not have admin access.
        </p>

        <div className="mt-8 space-y-3">
          {/*
            Signing out here drops THIS origin's cookie only — shai-admin-auth —
            and leaves any dashboard session on the app origin untouched. That
            separation is the point of the distinct cookie name; see
            lib/auth-cookie.js.
          */}
          <SignOutButton className="!mt-0 justify-center border border-line !text-ink-soft" />

          {/* Plain anchor, and only when the app origin is configured.
              next/link cannot navigate off-origin, and NEXT_PUBLIC_APP_URL is
              optional on this deployment — unset, there is no correct
              destination, so there is no link. See lib/app-links.js. */}
          {DASHBOARD && (
            <Button href={DASHBOARD} variant="secondary" className="w-full">
              Go to your dashboard
            </Button>
          )}
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <span className="eyebrow mb-5 block">Admin</span>
      <h1 className="hl text-[1.75rem] text-ink">Sign in</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-muted">
        This is a separate sign-in from the app. Your dashboard session does not
        carry over.
      </p>

      <div className="mt-8">
        <AdminAuthForm next={next} />
      </div>

      <p className="mt-8 flex items-start gap-2 text-[12px] leading-relaxed text-faint">
        <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
        Email and password only. Accounts created through Google need a password
        set from the Supabase dashboard first.
      </p>
    </Shell>
  )
}

/* Deliberately not apps/web's two-column (auth) layout. That one carries an
   editorial panel and a logo linking to the marketing site — neither belongs on
   an origin with no marketing story and no NEXT_PUBLIC_WWW_URL. */
function Shell({ children }) {
  return (
    <Container className="flex min-h-screen flex-col items-center justify-center">
      <div className="w-full max-w-sm">
        <Logo size={32} />
        <div className="mt-8">{children}</div>
      </div>
    </Container>
  )
}
