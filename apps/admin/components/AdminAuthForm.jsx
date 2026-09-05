'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Icon, { Spinner } from '@smarthire/ui/Icon'
import { Button } from '@smarthire/ui'

/*
  ADMIN SPLIT 2026-09-01 ─ WRITTEN SMALL RATHER THAN COPIED FROM apps/dashboard.

  apps/dashboard/components/auth/AuthForm.jsx is 500+ lines, and every one of its
  extras is an apps/dashboard concept that would be wrong here:

    mode="signup" + emailRedirectTo   There is no self-service admin signup, and
                                      there will not be. Shipping a signup path
                                      onto the origin that grants credits is
                                      net-new attack surface for no benefit.
    fetch('/api/devices/register')    No devices table on this origin. The call
                                      would 404 on every admin sign-in and be
                                      swallowed by its own catch — invisible.
    signInWithOAuth({ google })       See below.
    ?signed_out=device banner         That flow lives next door.
    cross-origin ?next= from the site Nothing off-origin links here.

  Copying it and deleting half would be worse than writing this: the copy then
  drifts, and a security fix applied to one is not applied to the other. What is
  genuinely shared is presentational — Field and PasswordToggle — and those are
  duplicated below with this note rather than lifted into packages/ui, which can
  happen later if a third caller appears.

  NO GOOGLE OAUTH, AND THE REASON IS NOT LAZINESS. OAuth would need an
  app/auth/callback route here AND https://admin.<domain>/auth/callback plus
  every preview URL added to Supabase's Redirect URLs — manual production state
  this split otherwise avoids entirely. Worse, the failure mode apps/dashboard's
  AuthForm already documents is nastier on this origin: on a Redirect-URL miss
  Supabase SILENTLY substitutes the project Site URL, so a mis-listed preview
  would complete a Google sign-in and land the admin on app.<domain> holding a
  dashboard session and no admin session, with nothing anywhere saying why.

  Password sign-in consults Redirect URLs not at all. What it costs is written
  down in .env.local.example: an admin whose account was created through Google
  has no password, and this repo has no reset route, so one must be set from the
  Supabase dashboard before this ships.
*/

const FIELD_PADLESS =
  'w-full rounded-xl border border-line bg-paper py-2.5 text-[14px] text-ink ' +
  'placeholder:text-faint outline-none transition-colors ' +
  'focus:border-ink/40 focus-visible:outline-none'

const FIELD = `${FIELD_PADLESS} px-3.5`
const FIELD_WITH_TRAILING = `${FIELD_PADLESS} pl-3.5 pr-11`

/* Duplicated from apps/dashboard/components/auth/AuthForm.jsx. The px/pr split is not
   stylistic: stacking `pr-11` onto a class carrying `px-3.5` does NOT reliably
   win, because shorthand and longhand of one property collide and Tailwind v4
   resolves that by stylesheet order, not by class-attribute order. */
function Field({ label, trailing, ...props }) {
  return (
    <div>
      <label htmlFor={props.name} className="mb-1.5 block text-[13px] font-medium text-ink-soft">
        {label}
      </label>
      <div className={trailing ? 'relative' : ''}>
        <input id={props.name} className={trailing ? FIELD_WITH_TRAILING : FIELD} {...props} />
        {trailing}
      </div>
    </div>
  )
}

/* type="button" is load-bearing: a bare <button> inside a <form> defaults to
   submit, so revealing the password would post the form instead. */
function PasswordToggle({ shown, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      aria-pressed={shown}
      className={
        'absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center ' +
        'rounded-lg text-faint transition-colors hover:bg-canvas-2 hover:text-ink ' +
        'focus-visible:bg-canvas-2 focus-visible:text-ink focus-visible:outline-none'
      }
    >
      <Icon name={shown ? 'eyeOff' : 'eye'} size={17} />
    </button>
  )
}

export default function AdminAuthForm({ next }) {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [shown, setShown]       = useState(false)
  const [error, setError]       = useState('')
  const [pending, startTransition] = useTransition()

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    startTransition(async () => {
      const { error: signInError } = await createClient()
        .auth.signInWithPassword({ email, password })

      if (signInError) {
        /*
          The message is deliberately not Supabase's. "Invalid login credentials"
          is fine, but a rate-limit or a confirmation error would tell an
          anonymous visitor which of the two halves they got right — and on this
          origin the set of valid emails is a much smaller and more interesting
          thing to enumerate than on the app.
        */
        setError('That email and password do not match an account.')
        return
      }

      /*
        replace(), not push(): the signed-out form should not sit in the back
        history of a signed-in admin. refresh() as well, because the destination
        is a Server Component whose gate has to re-run against the new cookie —
        without it the router can serve a cached RSC payload rendered while
        nobody was signed in.
      */
      router.replace(next || '/')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@company.com"
      />

      <Field
        label="Password"
        name="password"
        type={shown ? 'text' : 'password'}
        autoComplete="current-password"
        required
        value={password}
        onChange={e => setPassword(e.target.value)}
        trailing={<PasswordToggle shown={shown} onToggle={() => setShown(v => !v)} />}
      />

      {error && (
        <p className="flex items-center gap-2 text-[13px] text-critical" role="alert">
          <Icon name="ban" size={14} />
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <><Spinner size={15} /> Signing in…</> : 'Sign in'}
      </Button>
    </form>
  )
}
