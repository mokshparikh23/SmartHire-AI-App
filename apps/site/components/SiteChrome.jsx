import Link from 'next/link'
import Icon, { Logo } from 'smarthire-ui/Icon'
import { Container } from 'smarthire-ui'
import { LOGIN, SIGNUP, DASHBOARD } from '@/lib/app-links'

// The header reacts to scroll, so it lives in its own client component. Kept
// re-exported here so the layout still pulls both halves of the chrome from one
// place.
export { SiteNav } from './SiteNav'

/*
  SPLIT 2026-09-01: the Product column is real routes, and the Account column
  leaves for another origin.

  Those are two different kinds of link now and they cannot be rendered by one
  map. Same-origin entries stay next/link — they prefetch and client-navigate.
  Cross-origin entries have to be plain anchors: next/link is for in-app routes,
  which is the rule packages/ui/src/index.jsx already states where Button
  branches on the same test.
*/
const PRODUCT_LINKS = [
  ['How it works',        '/how-it-works'],
  ['Grounding',           '/how-it-works#grounded'],
  ['Features',            '/features'],
  ['Desi Mode',           '/features#desi'],
  ['Works with',          '/features#platforms'],
  ['What it does not do', '/features#limits'],
  ['Compare',             '/compare'],
  ['Pricing',             '/pricing'],
]

const ACCOUNT_LINKS = [
  ['Log in',         LOGIN],
  ['Create account', SIGNUP],
  ['Dashboard',      DASHBOARD],
]

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
            {/* DESI-MODE 2026-08-30: '/#desi' added after Features, rooted like
                its neighbours per the COMPARE note above. The footer is where
                the full section list lives; the header carries a subset.
                ['Product', [['How it works', '/#how'], ['Consent', '/#consent'], ['Features', '/#features'], ['Compare', '/compare'], ['Limits', '/#limits'], ['Pricing', '/#pricing']]], */}
            {/* CONCEPT 2026-08-30: '/#consent' → '/#grounded'. The section it
                pointed at is now Grounding — same slot, different argument, new
                id — and a stale fragment here would scroll nowhere.
                ['Product', [['How it works', '/#how'], ['Consent', '/#consent'], …]], */}
            {/*
              SPLIT 2026-09-01: SUPERSEDES the COMPARE note above rather than
              deleting it. Rooting the fragments at '/' was the right fix for a
              footer rendering on two pages of one site; now every entry is
              either a real route or a route plus a fragment, so the failure that
              note describes cannot recur in either direction.

              What DOES survive from it: this column is still the full section
              list, and the header still carries a subset.

              ['Product', [['How it works', '/#how'], ['Grounding', '/#grounded'], ['Features', '/#features'], ['Desi Mode', '/#desi'], ['Compare', '/compare'], ['Limits', '/#limits'], ['Pricing', '/#pricing']]],
            */}
            <div>
              <p className="eyebrow mb-3">Product</p>
              <ul className="space-y-2.5">
                {PRODUCT_LINKS.map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="text-[13px] text-muted transition-colors hover:text-ink">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* ['Account', [['Log in', '/login'], ['Create account', '/signup'], ['Dashboard', '/dashboard']]], */}
            <div>
              <p className="eyebrow mb-3">Account</p>
              <ul className="space-y-2.5">
                {ACCOUNT_LINKS.map(([label, href]) => (
                  <li key={href}>
                    <a href={href} className="text-[13px] text-muted transition-colors hover:text-ink">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/*
              SPLIT 2026-09-01: these were <Link href="#">, on every page.

              ['Legal',   [['Privacy', '#'], ['Terms', '#']]],

              Two links that do nothing were tolerable on a two-page site with no
              sitemap. They are not on a five-page one that ships canonicals and
              sends buyers to a payment page, and they are out of character for a
              repo that will not put a tick in a comparison cell it cannot check.

              So they say what is true — that the pages do not exist yet — until
              they do. Stripe and Razorpay will both want real ones, at which
              point these become routes and join sitemap.js. Deliberately kept
              OUT of the sitemap until then.
            */}
            <div>
              <p className="eyebrow mb-3">Legal</p>
              <ul className="space-y-2.5">
                {['Privacy', 'Terms'].map(label => (
                  <li key={label}>
                    <span className="text-[13px] text-faint">{label} — coming soon</span>
                  </li>
                ))}
              </ul>
            </div>
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
