/*
  COPY RULES: see the banner at the top of app/layout.js — no impersonation,
  no concealment, no latency figure.

  SPLIT 2026-09-01: a NEW extraction, not a move. This was an anonymous array
  literal inside the JSX of the pricing section in apps/dashboard/app/page.jsx.

  Four reassurances, placed at the point the decision is actually made — under
  the plans rather than in a footer. Each one is a fact about the build or the
  billing, not a slogan: Stripe Checkout is hosted so card details never touch
  our server, signup_bonus grants ten minutes (see lib/credits.js), credits have
  no expiry column at all, and a cancelled subscription runs to the end of the
  period already paid for.
*/
export const PRICING_MARKS = [
  ['lock',   'Card details go straight to Stripe'],
  ['gift',   'Ten free minutes on every new account'],
  ['clock',  'Unused credits never expire'],
  ['shield', 'Cancel a subscription any time'],
]
