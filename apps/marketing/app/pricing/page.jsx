import { headers } from 'next/headers'
import Link from 'next/link'
import Icon from '@smarthire/ui/Icon'
import { Container, Badge } from '@smarthire/ui'
import PricingPlans from '@smarthire/ui/PricingPlans'
import Reveal from '@/components/Reveal'
import SectionMark from '@/components/SectionMark'
import FaqAccordion from '@/components/FaqAccordion'
import CloseCard from '@/components/CloseCard'
import { PRICING_MARKS } from '@/content/pricing-marks'
import { FAQ_BUYING } from '@/content/faqs'
import { APP_ORIGIN } from '@/lib/app-links'
import {
  resolveCurrency, tiersForCurrency, packsForCurrency, singlePackForCurrency,
} from '@smarthire/pricing'

/*
  COPY RULES: see the banner at the top of app/layout.js — no impersonation,
  no concealment, no latency figure.

  SPLIT 2026-09-01: section 06 of the old apps/dashboard/app/page.jsx, which was a
  #pricing anchor and never a route. "Pricing" in the header pointed at a
  fragment; it points at this file now.

  The hero copy is PROMOTED, not written. The section's SectionMark title and
  lede become the page's <h1> and lede verbatim — promoting a heading is the
  cleanest thing a decomposition can do, and it means the page that quotes money
  invents no new sentence about it.

  WHAT THIS PAGE DOES NOT DO ANY MORE:

    id="pricing" / scroll-mt-24 — the fragment they served is a whole route now,
    and LegacyHash redirects /#pricing here. The section had them because it
    landed under a sticky 4rem header; that is what base.css's
    `scroll-padding-top: 5rem` is for.

    signedIn — the landing page used to ask Supabase, so Buy could go straight to
    Stripe for someone already logged in. This origin is not sent that cookie,
    and the fix is not to widen the cookie: PricingPlans navigates to the app
    with the pack id, and the app — which holds the session — decides. See
    appOrigin below and lib/app-links.js.
*/

export const metadata = {
  title: 'Pricing — unlimited, or by the hour',
  description:
    'One credit is one hour of live interview time, metered by the minute and never ' +
    'expiring. Or an unlimited subscription. Ten free minutes on every new account, ' +
    'no card.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Pricing — Smart Hire AI',
    description:
      'Go unlimited, or pay by the hour. Ten free minutes on every new account, no card.',
    url: '/pricing',
  },
}

export default async function PricingPage() {
  /*
    Dynamic, and it has to be. resolveCurrency reads this request's geo headers,
    which is the same call /api/checkout makes on the other origin — so the price
    quoted here and the price charged there cannot disagree.

    DO NOT ADD `export const revalidate` OR A CACHE HEADER TO THIS PAGE. A shared
    cache in front of it serves one country's price to another while checkout
    charges the real one. The full note is on resolveCurrency in packages/pricing.
  */
  const currency = resolveCurrency(await headers())
  const single = singlePackForCurrency(currency)

  return (
    <>
      {/* ═══════════════════════════════════════════════ hero ═════════ */}
      <section className="border-b border-line-soft">
        <Container wide className="py-16 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <Badge tone="accent" className="mb-7">
              <Icon name="sparkle" size={12} />
              Pricing
            </Badge>

            <h1 className="hl text-[clamp(2rem,4.2vw,3.2rem)] text-ink">
              Go unlimited, or pay by the hour.
            </h1>

            <p className="mt-8 text-[17px] leading-relaxed text-muted">
              One credit is one hour of interview time, counted a minute at a time. Use
              30 minutes and the other 30 stay in your account.
            </p>

            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              Ten free minutes on every new account, no card.
            </p>
          </div>
        </Container>
      </section>

      {/* ═════════════════════════════════════════ 01 the plans ═══════ */}
      <Reveal as="section" className="border-b border-line-soft py-24 sm:py-32">
        <Container wide>
          <SectionMark
            no="01"
            label="Plans"
            title="Two ways to pay, and one of them has nothing to cancel."
            center
          />

          <div className="mt-16">
            {/*
              SPLIT 2026-09-01: appOrigin is what turns Buy from a fetch into a
              navigation.

              With it set, PricingPlans stops calling /api/checkout — which does
              not exist on this deployment and would have no session cookie to
              send if it did — and goes to <app>/dashboard/billing?plan=<id>
              instead. Only the pack id crosses. Currency is resolved again from
              the app's own request headers, so nothing about the money can be
              named by this page or by the browser.

              No signedIn prop: this site cannot know, and does not need to.
              /dashboard/billing decides — signed in, the plan is preselected;
              signed out, proxy.js carries the destination through /login.
            */}
            <PricingPlans
              tiers={tiersForCurrency(currency)}
              packs={packsForCurrency(currency)}
              singlePack={single}
              appOrigin={APP_ORIGIN}
            />
          </div>

          {/* Reassurance, at the point the decision is actually made. */}
          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 border-t border-line-soft pt-10 text-[13px] text-muted">
            {PRICING_MARKS.map(([icon, text]) => (
              <span key={text} className="flex items-center gap-2">
                <Icon name={icon} size={15} className="text-faint" />
                {text}
              </span>
            ))}
          </div>

          {/* One line across to the comparison, for the reader who wants to know
              what an hour costs elsewhere before committing. */}
          <div className="mt-10 text-center">
            <Link
              href="/compare"
              className="group inline-flex items-center gap-2 border-b border-line pb-1 text-[14px] font-medium text-ink transition-colors hover:border-ink"
            >
              What an hour costs elsewhere
              <Icon
                name="arrowRight"
                size={15}
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </Container>
      </Reveal>

      {/* ═════════════════════════════════════════════ faq ════════════ */}
      {/* Unnumbered — the number is for the argument, and this answers it. */}
      <Reveal as="section" id="faq" className="scroll-mt-24 border-b border-line-soft bg-canvas py-24 sm:py-32">
        <Container>
          <SectionMark label="Questions" title="Before you pay for it." />
          <div className="mt-14">
            <FaqAccordion items={FAQ_BUYING} />
          </div>
        </Container>
      </Reveal>

      <CloseCard
        title="Ten free minutes is enough to decide."
        lede="One real interview, end to end, before any of the above applies to you."
      />
    </>
  )
}
