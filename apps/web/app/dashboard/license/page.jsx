import { requireUser, getSupabase } from '@/lib/auth'
import { ensureLicense } from 'smarthire-data/license'
import { getLatestRelease } from '@/lib/releases'
import LicenseCard from '@/components/dashboard/LicenseCard'
import { Card, Button, PageHeader, EmptyState } from 'smarthire-ui'
import PageTransition from '@/components/ui/PageTransition'

export const metadata = { title: 'License — Smart Hire AI' }

const STEPS = [
  'Download and open the desktop app.',
  'Copy your licence key from the card above.',
  'Paste it into the activation screen and press Activate.',
]

export default async function LicensePage() {
  // PIVOT 2026-08-29: the un-guarded getUser() below dereferenced user.id on the
  // next line, which threw a TypeError on a lapsed session. requireUser()
  // redirects instead, and both calls are cache()d across the render pass.
  //
  // const supabase = await createClient()
  // const { data: { user } } = await supabase.auth.getUser()
  const user = await requireUser()
  const supabase = await getSupabase()

  /*
    AUTO-ISSUE 2026-09-01: this page reads `licenses` directly rather than going
    through getEntitlement(), and it renders in a different Suspense subtree from
    <Sidebar> — so it cannot assume the sidebar's ensureLicense() has already
    landed. Without this call, the one page whose entire job is showing the key
    would be the one page that never mints it.

    Awaited, not fire-and-forget: the query below has to see the row.
  */
  await ensureLicense(user.id).catch(() => {})

  const [{ data: licenses }, release] = await Promise.all([
    supabase
      .from('licenses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    getLatestRelease(),
  ])

  const active = licenses?.filter(l => l.status === 'active') ?? []
  const past   = licenses?.filter(l => l.status !== 'active') ?? []

  return (
    <PageTransition>
      <div>
        <PageHeader title="License" lede="Your keys and how to activate them." />

        {active.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              icon="key"
              title="No active licence"
              description="You need an active licence key to use the desktop app."
              action={<Button href="/dashboard/billing" iconRight="arrowRight">View plans</Button>}
            />
          </Card>
        ) : (
          <>
            <div className="space-y-5">
              {active.map(license => <LicenseCard key={license.id} license={license} />)}
            </div>

            <Card className="mt-5">
              <h2 className="text-[15px] font-semibold text-ink">How to activate</h2>
              <ol className="mt-5 space-y-3.5">
                {STEPS.map((step, i) => (
                  <li key={step} className="flex gap-3 text-[14px] leading-relaxed text-ink-soft">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-canvas-2 text-[11px] font-medium text-muted"
                      data-numeric
                    >
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>

              {/*
                RELEASE 2026-08-30: step 1 said "Download and open the desktop
                app" with nothing on the page to download, which left the only
                actionable step as the one the reader had to go and find. The
                buttons appear only once a build exists, so the step never
                points at a 503.
              */}
              {release && (
                <div className="mt-5 flex flex-wrap gap-3 border-t border-line-soft pt-5">
                  {release.mac && (
                    <Button as="a" href="/api/download/mac" variant="secondary" size="sm" icon="apple">
                      macOS
                    </Button>
                  )}
                  {release.win && (
                    <Button as="a" href="/api/download/win" variant="secondary" size="sm" icon="windows">
                      Windows
                    </Button>
                  )}
                </div>
              )}

              <p className="mt-5 border-t border-line-soft pt-4 text-[13px] text-muted">
                The app re-checks your licence while it runs. If it is revoked, the app signs out on its own.
              </p>
            </Card>
          </>
        )}

        {past.length > 0 && (
          <>
            <p className="eyebrow mb-3 mt-10">Past licences</p>
            <div className="space-y-5">
              {past.map(license => <LicenseCard key={license.id} license={license} />)}
            </div>
          </>
        )}
      </div>
    </PageTransition>
  )
}
