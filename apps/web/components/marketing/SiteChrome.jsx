import Link from 'next/link'
import Icon, { Logo } from '@/components/ui/Icon'
import { Container } from '@/components/ui'

// The header reacts to scroll, so it lives in its own client component. Kept
// re-exported here so pages still pull both halves of the chrome from one place.
export { SiteNav } from './SiteNav'

export function SiteFooter() {
  return (
    <footer className="border-t border-line-soft bg-canvas">
      <Container wide className="py-14">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <Logo size={28} />
              <span className="text-[14px] font-semibold tracking-tight text-ink">Smart Hire AI</span>
            </div>
            {/* PIVOT 2026-08-29: was "Real-time answers during live interviews,
                drawn from your own résumé." — the candidate-side pitch.
                CONCEPT 2026-08-30: which is the pitch again, so it is restored
                verbatim. The interviewer-side line it replaced: "A copilot for
                the person running the interview, used with the candidate's
                knowledge." */}
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              Real-time answers during live interviews, drawn from your own résumé.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-14 gap-y-8 sm:grid-cols-3">
            {/*
              COMPARE 2026-08-30: the Product fragments were bare — `#how` rather
              than `/#how`. The footer renders on every page, so from /compare
              each of those pointed at an anchor that does not exist on that page
              and did nothing at all. See the same note in SiteNav.jsx.

              ['Product', [['How it works', '#how'], ['Consent', '#consent'], ['Features', '#features'], ['Limits', '#limits'], ['Pricing', '#pricing']]],
            */}
            {[
              /* DESI-MODE 2026-08-30: '/#desi' added after Features, rooted like
                 its neighbours per the COMPARE note above. The footer is where
                 the full section list lives; the header carries a subset.
                 ['Product', [['How it works', '/#how'], ['Consent', '/#consent'], ['Features', '/#features'], ['Compare', '/compare'], ['Limits', '/#limits'], ['Pricing', '/#pricing']]], */
              /* CONCEPT 2026-08-30: '/#consent' → '/#grounded'. The section it
                 pointed at is now Grounding — same slot, different argument, new
                 id — and a stale fragment here would scroll nowhere.
                 ['Product', [['How it works', '/#how'], ['Consent', '/#consent'], …]], */
              ['Product', [['How it works', '/#how'], ['Grounding', '/#grounded'], ['Features', '/#features'], ['Desi Mode', '/#desi'], ['Compare', '/compare'], ['Limits', '/#limits'], ['Pricing', '/#pricing']]],
              ['Account', [['Log in', '/login'], ['Create account', '/signup'], ['Dashboard', '/dashboard']]],
              ['Legal',   [['Privacy', '#'], ['Terms', '#']]],
            ].map(([heading, links]) => (
              <div key={heading}>
                <p className="eyebrow mb-3">{heading}</p>
                <ul className="space-y-2.5">
                  {links.map(([label, href]) => (
                    <li key={label}>
                      <Link href={href} className="text-[13px] text-muted transition-colors hover:text-ink">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-faint">
            © {new Date().getFullYear()} Smart Hire AI. All rights reserved.
          </p>
          {/* PIVOT 2026-08-29: this claimed "Your résumé and transcripts stay on
              your machine", which was never true — both are sent to our server
              and on to OpenAI. Replaced with the part that IS true. */}
          <p className="flex items-center gap-1.5 text-[12px] text-faint">
            <Icon name="lock" size={13} />
            No API key to set up — your plan covers the AI cost
          </p>
        </div>
      </Container>
    </footer>
  )
}
