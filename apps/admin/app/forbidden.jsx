import { Container, Button } from '@smarthire/ui'
import { getUser } from '@/lib/auth'
import { DASHBOARD } from '@/lib/app-links'
import SignOutButton from '@/components/SignOutButton'

/**
 * ADMIN SPLIT 2026-09-01 ─ what requireAdminPage() throws into.
 *
 * Rendered by Next's access-fallback boundary when forbidden() is called, with a
 * real HTTP 403. It needs `experimental: { authInterrupts: true }` in
 * next.config.mjs; without the flag forbidden() throws a plain E488 error at
 * runtime instead, on the deny path — which is by definition the path nobody
 * exercises. That is why the Phase 3 drill signs in as a non-admin on purpose.
 *
 * WHY THIS PAGE EXISTS AT ALL, rather than a redirect to the app: the deny
 * target on this origin cannot be /dashboard, and a cross-origin bounce needs
 * NEXT_PUBLIC_APP_URL, which is optional here — so a page has to exist for the
 * unset case regardless. Given that, a silent bounce would only add a second
 * code path and make "not an admin" indistinguishable from "the admin site is
 * broken". The full argument is in requireAdminPage() in lib/auth.js.
 *
 * It does not list what the console contains. Not for secrecy — /login is public
 * and the hostname is in Certificate Transparency logs — but because the only
 * people who see this page are the ones with no use for a map of it.
 */
export default async function Forbidden() {
  // Safe on this path: forbidden() is only reachable past requireUser(), so
  // there is a session. Falls back gracefully if that ever stops being true.
  const user = await getUser().catch(() => null)

  return (
    <Container className="flex min-h-screen flex-col items-center justify-center text-center">
      <span className="eyebrow mb-6">Error 403</span>

      <h1 className="hl text-[clamp(1.75rem,4vw,2.25rem)] text-ink">
        Not an administrator
      </h1>

      <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-muted">
        {user?.email
          ? <>You are signed in as <span className="font-medium text-ink">{user.email}</span>. That account does not have admin access.</>
          : <>That account does not have admin access.</>}
      </p>

      <div className="mt-9 w-full max-w-[220px] space-y-3">
        <SignOutButton className="!mt-0 justify-center border border-line !text-ink-soft" />
        {DASHBOARD && (
          <Button href={DASHBOARD} variant="secondary" className="w-full">
            Go to your dashboard
          </Button>
        )}
      </div>
    </Container>
  )
}
