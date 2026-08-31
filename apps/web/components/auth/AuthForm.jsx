'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { safeNext } from '@/lib/next-url'
import Icon, { Spinner } from 'smarthire-ui/Icon'
import { Button } from 'smarthire-ui'

/*
  AUTH 2026-08-30: split so the password field can inset its show/hide button
  and reserve room for it. This is the same split, for the same reason, as
  CONTROL_PADLESS in packages/ui/src/index.jsx: stacking `pr-11` onto a class that
  already carries `px-3.5` would NOT reliably win, because shorthand and
  longhand of one property collide and Tailwind v4 resolves that by stylesheet
  order, not by the order of your class attribute.

  const FIELD =
    'w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-[14px] text-ink ' +
    'placeholder:text-faint outline-none transition-colors ' +
    'focus:border-ink/40 focus-visible:outline-none'
*/
const FIELD_PADLESS =
  'w-full rounded-xl border border-line bg-paper py-2.5 text-[14px] text-ink ' +
  'placeholder:text-faint outline-none transition-colors ' +
  'focus:border-ink/40 focus-visible:outline-none'

const FIELD = `${FIELD_PADLESS} px-3.5`

/** Room on the right for one inset control, and no more. */
const FIELD_WITH_TRAILING = `${FIELD_PADLESS} pl-3.5 pr-11`

function Field({ label, hint, trailing, ...props }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={props.name} className="text-[13px] font-medium text-ink-soft">{label}</label>
        {hint}
      </div>
      {/* Was a bare <input>; the wrapper is what the inset toggle positions
          against, and it is only added when there is something to inset.
          <input id={props.name} className={FIELD} {...props} /> */}
      <div className={trailing ? 'relative' : ''}>
        <input
          id={props.name}
          className={trailing ? FIELD_WITH_TRAILING : FIELD}
          {...props}
        />
        {trailing}
      </div>
    </div>
  )
}

/**
 * Show / hide control for a password box.
 *
 * type="button" is load-bearing: a bare <button> inside a <form> defaults to
 * submit, so revealing the password would post the form instead.
 */
function PasswordToggle({ shown, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      // The label says what the click will DO, and aria-pressed carries the
      // current state — announcing "hide password" while the field is masked
      // would describe the opposite of what is on screen.
      aria-label={shown ? 'Hide password' : 'Show password'}
      aria-pressed={shown}
      title={shown ? 'Hide password' : 'Show password'}
      className={
        'absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center ' +
        'rounded-lg text-faint transition-colors hover:bg-canvas-2 hover:text-ink ' +
        // No ring utilities anywhere in this app, so focus is shown the way the
        // rest of the UI shows it: a background and a darker mark.
        'focus-visible:bg-canvas-2 focus-visible:text-ink focus-visible:outline-none'
      }
    >
      <Icon name={shown ? 'eyeOff' : 'eye'} size={17} />
    </button>
  )
}

export default function AuthForm({ mode }) {
  const router   = useRouter()
  const supabase = createClient()
  const isLogin  = mode === 'login'

  const searchParams = useSearchParams()

  // Set by /auth/device-signout when this browser was signed out from elsewhere.
  const signedOutByDevice = searchParams.get('signed_out') === 'device'

  /*
    SPLIT 2026-09-01: where to go after this form succeeds.

    Set by proxy.js when it bounces a signed-out visitor off a protected page —
    which, since the marketing site moved to its own origin, is most often
    /dashboard/billing?plan=<packId> after someone clicked Buy on smarthire.ai.
    Absent for anyone who just navigated to /login themselves, and then the
    landing stays /dashboard exactly as before.

    Re-validated here even though proxy.js already validated it on the way in:
    the value arrives in a URL the browser controls, and nothing downstream
    should have to know which hop it came from. See lib/next-url.js.
  */
  const next = safeNext(searchParams.get('next'))
  const destination = next ?? '/dashboard'

  const [form, setForm]       = useState({ email: '', password: '', full_name: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [pending, startTransition] = useTransition()

  // AUTH 2026-08-30: masked until asked otherwise, and then left as the user set
  // it — including across a failed attempt. Re-masking on an error would take
  // the password away at the exact moment it is being re-read for the typo that
  // caused the error.
  const [showPassword, setShowPassword] = useState(false)

  /*
    AUTH 2026-08-30: true from the moment Supabase accepts the credentials until
    this component is unmounted by the navigation.

    Kept separate from `loading`/`pending` because it means something different
    to the person watching: those two say "still working", this one says "your
    password was right, the wait from here is the app moving". Without it the
    button says "please wait" for the whole span — the credential check AND the
    dashboard load — and a correct password is indistinguishable from a hang.
  */
  const [signedIn, setSignedIn] = useState(false)

  // True from the Google click until the browser actually leaves for Google.
  const [oauth, setOauth] = useState(false)

  // Nothing on /login links to /dashboard, so the router never had a prefetch
  // entry for it and every successful sign-in paid a cold round trip before the
  // screen changed. Warming it here is most of why login felt slow.
  //
  // SPLIT 2026-09-01: warms the actual destination, which is no longer always
  // /dashboard. A buyer arriving from the marketing site is headed for
  // /dashboard/billing, and prefetching the page they are NOT going to would
  // have handed the whole saving back.
  // if (isLogin) router.prefetch('/dashboard')
  useEffect(() => {
    if (isLogin) router.prefetch(destination)
  }, [isLogin, router, destination])

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  /**
   * Where Supabase sends the browser back — for the OAuth round trip and for the
   * link inside the confirmation email. Both land on /auth/callback, which
   * exchanges the code and then honours ?next=.
   *
   * Built from window.location.origin rather than an env var so it is correct on
   * localhost, on a preview deploy and in production without configuration. Only
   * ever called from an event handler, so `window` is available.
   */
  const callbackUrl = (target) => {
    const base = `${window.location.origin}/auth/callback`
    return target ? `${base}?next=${encodeURIComponent(target)}` : base
  }

  /** An in-app auth route with the current ?next= reattached, if there is one. */
  const withNext = (path) => (next ? `${path}?next=${encodeURIComponent(next)}` : path)

  // `loading` is the request; `pending` is the navigation it triggers. Both mean
  // the same thing to the person waiting, so they are read as one flag.
  const busy = loading || pending

  const handleSubmit = async e => {
    e.preventDefault()

    // The submit button is disabled through all of this, but Enter in a text
    // field submits the form regardless of the button's state — without this,
    // a second Enter during the navigation fires a second sign-in.
    if (loading || signedIn || oauth) return

    setError('')
    setLoading(true)

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email:    form.email,
          password: form.password,
        })
        if (error) throw error

        /*
          AUTH 2026-08-30: flipped HERE, before the device call and the
          navigation — not after them. Those two are the slow half of a sign-in,
          and this is the exact instant the answer to "was my password right?"
          becomes known. Holding the confirmation until they finish would put
          the acknowledgement after the wait it exists to explain.
        */
        setSignedIn(true)

        /*
          DEVICES 2026-08-30: clear any revocation on this browser before
          navigating.

          Signing a browser out sets revoked_at, and the device cookie outlives a
          sign-out — so without this, the browser you signed out could log in
          successfully and then be bounced straight back here by DeviceGate, on
          every attempt, permanently. `fresh=1` is the only thing that clears a
          revocation, and it is only reachable from right here: an ambient
          dashboard load must never clear one.

          Awaited rather than fired-and-forgotten: the navigation below renders
          DeviceGate, which reads the row. Racing them would sign the user out
          roughly half the time.

          A failure is swallowed — a device-bookkeeping problem must not block a
          sign-in that Supabase has already accepted.
        */
        try {
          await fetch('/api/devices/register?fresh=1', { method: 'POST' })
        } catch { /* non-fatal; the sign-in itself succeeded */ }

        // PIVOT 2026-08-29: was
        //   router.push('/dashboard')
        //   router.refresh()
        // which fired TWO RSC requests — refresh() invalidates the router cache
        // and refetches exactly what push() just fetched, and each one re-ran
        // the proxy. replace() alone is right here: it also keeps the login page
        // out of the back-button history, so "back" after signing in does not
        // land on a form that immediately redirects.
        //
        // Wrapped in startTransition so `pending` stays true until the
        // navigation COMMITS. The old code called setLoading(false) in the
        // finally block, which re-enabled the button while the page was still
        // moving — the button looked ready while nothing was happening.
        //
        // SPLIT 2026-09-01: `destination`, not a literal — see the note where it
        // is derived. Still replace() rather than push(), for the reason above.
        // startTransition(() => { router.replace('/dashboard') })
        startTransition(() => { router.replace(destination) })
        return
      } else {
        /*
          SPLIT 2026-09-01: signup carries the destination too, through the
          confirmation email.

          PricingPlans.jsx has carried this note since it was written:

              "No ?next= here: signup ends on an email-confirmation screen and
               returns through /auth/callback, so a redirect target would be
               dropped on the way."

          That was true of the TARGET and not of the MECHANISM. /auth/callback
          has always read ?next= — nothing in the repo ever set one. The hop
          that was losing it is the confirmation link, and the confirmation link
          is exactly what emailRedirectTo writes. So the target survives after
          all, and a new customer who clicked a plan on the marketing site lands
          on that plan rather than on a bare dashboard after confirming.

          THIS FAILS SILENTLY IF THE URL IS NOT ALLOW-LISTED. Supabase matches
          emailRedirectTo against Auth -> URL Configuration -> Redirect URLs and,
          on a miss, quietly substitutes the project Site URL instead of
          erroring. The plan is dropped again and nothing anywhere says so, so
          both origins must be listed before this is relied on.

          // options: { data: { full_name: form.full_name } },
        */
        const { error } = await supabase.auth.signUp({
          email:    form.email,
          password: form.password,
          options:  {
            data: { full_name: form.full_name },
            emailRedirectTo: callbackUrl(next),
          },
        })
        if (error) throw error
        setSent(true)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div>
        <span className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-positive-soft text-positive">
          <Icon name="check" size={20} />
        </span>
        <h1 className="display text-[2rem] text-ink">Check your email</h1>
        <p className="mt-4 text-[14px] leading-relaxed text-muted">
          We sent a confirmation link to <span className="font-medium text-ink">{form.email}</span>.
          Open it to activate your account.
        </p>
        {/* SPLIT 2026-09-01: keeps ?next= — someone who signed up from a plan
            link and comes back through here should still land on that plan.
            href="/login" */}
        <Link
          href={withNext('/login')}
          className="mt-8 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink hover:text-accent"
        >
          Back to sign in
          <Icon name="arrowRight" size={15} />
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h1 className="display text-[2rem] text-ink">
        {isLogin ? 'Welcome back.' : 'Create your account.'}
      </h1>
      <p className="mt-2.5 text-[14px] text-muted">
        {isLogin ? 'New here? ' : 'Already have an account? '}
        {/* SPLIT 2026-09-01: ?next= survives the toggle between the two forms —
            without it, "Create an account" silently discarded the plan the
            visitor arrived with.
            href={isLogin ? '/signup' : '/login'} */}
        <Link href={withNext(isLogin ? '/signup' : '/login')} className="font-medium text-ink underline underline-offset-4 hover:text-accent">
          {isLogin ? 'Create an account' : 'Sign in'}
        </Link>
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {!isLogin && (
          <Field
            label="Full name" name="full_name" type="text" required
            value={form.full_name} onChange={handleChange} placeholder="Ada Lovelace"
            autoComplete="name"
          />
        )}

        <Field
          label="Email" name="email" type="email" required
          value={form.email} onChange={handleChange} placeholder="you@company.com"
          autoComplete="email"
        />

        {/*
          AUTH 2026-08-30: was type="password" with no way back out of the mask.
          A typo in a field you cannot read is the most common reason a correct
          password "fails", and on the signup side a 6-character minimum you
          cannot see is worse still.

          <Field
            label="Password" name="password" type="password" required minLength={6}
            value={form.password} onChange={handleChange} placeholder="At least 6 characters"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
          />
        */}
        <Field
          label="Password" name="password" required minLength={6}
          type={showPassword ? 'text' : 'password'}
          value={form.password} onChange={handleChange} placeholder="At least 6 characters"
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          trailing={
            <PasswordToggle
              shown={showPassword}
              onToggle={() => setShowPassword(v => !v)}
            />
          }
        />

        {error && (
          <p className="flex items-start gap-2 rounded-xl bg-critical-soft px-3.5 py-3 text-[13px] text-critical">
            <Icon name="ban" size={15} className="mt-px shrink-0" />
            {error}
          </p>
        )}

        {/*
          DEVICES 2026-08-30: without this, being signed out from another machine
          lands you on a bare login form with no idea why — which reads as the app
          losing your session rather than as the security feature working.

          Suppressed once a real error is showing: "you were signed out" above
          "wrong password" is two explanations for one empty form.
        */}
        {signedOutByDevice && !error && (
          <p className="flex items-start gap-2 rounded-xl bg-canvas-2 px-3.5 py-3 text-[13px] text-ink-soft">
            <Icon name="shield" size={15} className="mt-px shrink-0 text-faint" />
            You signed this browser out from another device. Sign in again to continue.
          </p>
        )}

        {/* `pending` covers the navigation after a successful sign-in; `loading`
            covers the auth round trip before it. Without both, the button
            re-enables mid-transition and the form looks idle while it is moving. */}
        {/*
          AUTH 2026-08-30: was a single label swap to "Please wait…" —

          <Button type="submit" disabled={loading || pending} size="lg" className="w-full">
            {loading || pending ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
          </Button>

          — which is a STILL button with different words on it. Nothing moves, so
          it reads as a button that swallowed the click, and it says the same
          thing whether the password is being checked or has already been
          accepted. Three distinct states now: idle, working (a spinner, and a
          label naming the actual step), and accepted (green, a tick, and the
          reason the screen has not changed yet).

          aria-live on the wrapper, not the button: a screen reader announces a
          button when it is focused, and this text changes while focus sits still
          on it. `polite` so it waits for the reader to finish the sentence it
          is on. Sign-in failures are announced by the error block above.
        */}
        <div aria-live="polite">
          <Button
            type="submit"
            variant={signedIn ? 'positive' : 'primary'}
            disabled={busy || signedIn}
            size="lg"
            className="w-full"
            /*
              The shared Button dims every disabled state to 40%. That is right
              for "you cannot press this yet" and wrong for both states here: it
              washes out the very feedback this change exists to add — a 40%
              spinner is nearly invisible on paper, and a faded green tick reads
              as one more thing switched off. Full strength for the
              confirmation, 72% while busy, which still says "not pressable".

              Inline rather than a `disabled:opacity-100` class, because two
              opacity utilities on one element are resolved by stylesheet order,
              not by the order of the class attribute.
            */
            style={signedIn ? { opacity: 1 } : busy ? { opacity: 0.72 } : undefined}
          >
            {signedIn ? (
              <>
                <Icon name="check" size={17} strokeWidth={2} />
                Signed in — opening your dashboard…
              </>
            ) : busy ? (
              <>
                <Spinner size={16} />
                {isLogin ? 'Checking your details…' : 'Creating your account…'}
              </>
            ) : isLogin ? 'Sign in' : 'Create account'}
          </Button>
        </div>
      </form>

      <div className="my-6 flex items-center gap-4">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[12px] text-faint">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      {/*
        AUTH 2026-08-30: this button had no busy state at all, and it is the one
        that waits longest — a redirect off to Google, over the network, with the
        page sitting still. It also awaited signInWithOAuth and then ignored the
        `error` it resolves with, so a failed redirect left the user staring at
        an unchanged form with nothing said.

        Disabled while the password form is mid-flight: two sign-ins racing each
        other is not a state worth reasoning about.
      */}
      <button
        type="button"
        disabled={oauth || busy || signedIn}
        onClick={async () => {
          setError('')
          setOauth(true)
          // SPLIT 2026-09-01: carries ?next= through the Google round trip, the
          // same way the password and signup paths do. Was:
          // options: { redirectTo: `${window.location.origin}/auth/callback` },
          const { error } = await createClient().auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: callbackUrl(next) },
          })
          // Reached only when the redirect never happened. On success this page
          // is already being torn down, so there is nothing to hand back.
          if (error) {
            setError(error.message)
            setOauth(false)
          }
        }}
        aria-live="polite"
        className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-line bg-paper text-[15px] font-medium text-ink transition-colors hover:bg-canvas disabled:pointer-events-none disabled:opacity-40"
      >
        {oauth ? (
          <>
            <Spinner size={16} />
            Taking you to Google…
          </>
        ) : (
          <>
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </>
        )}
      </button>
    </div>
  )
}
