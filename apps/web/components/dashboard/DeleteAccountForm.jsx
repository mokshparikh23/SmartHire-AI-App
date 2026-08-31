'use client'

import { useEffect, useRef, useState } from 'react'
import Icon from 'smarthire-ui/Icon'
import { Button } from 'smarthire-ui'
import { DELETE_CONFIRM_WORD, matchesDeleteConfirmation } from '@/lib/delete-account'

/*
  DELETE-ACCOUNT 2026-09-01

  ARMED IN PLACE, NOT IN A DIALOG.

  InterviewProfiles.jsx states the house rule: "the question is asked in the row
  itself rather than in a dialog over the page: what is about to be destroyed is
  right there, named, and does not have to be described a second time in a
  modal." The obvious objection is that this is far more destructive than
  deleting one interview and so deserves a heavier container. That gets the
  argument backwards. The card above this control is a two-paragraph inventory of
  exactly what is destroyed and exactly what survives, and re-reading it is the
  entire reason the box below is worth typing into. A dialog would cover that
  inventory with a two-line restatement at the precise moment the reader is
  deciding — and a SUMMARY of an irreversible act is the one thing this screen
  must not offer.

  What the extra severity buys is a THIRD GATE rather than a different container:

    1. arm     — click "Delete my account…"        (filters the accidental click)
    2. type    — type the word                     (filters the unconsidered one)
    3. confirm — click the button that says so     (the commit)

  A modal adds a lid, not a gate. There is also no Modal in packages/ui: the only
  two overlays in the app are the private one in admin/users/UserActions.jsx,
  which has no Escape handler, no scroll lock and no focus management, and the
  hand-rolled viewer in OriginalPdf.jsx. Shipping the most destructive control in
  the product on top of the first, or copying the second, are both worse than
  needing neither.
*/

/*
  A LOCAL field string, and the border is PICKED rather than stacked.

  This field has to swap both its resting border and its focus border when the
  word does not match. Writing that as `${CONTROL} border-critical` would put two
  border-color utilities on one element, and Tailwind v4 settles that by
  stylesheet order rather than by the order of the class attribute — the trap
  packages/ui/src/index.jsx warns about four times. So the two states are whole,
  mutually exclusive strings.

  Local rather than promoted to packages/ui: ProfileForm.jsx next door and
  AuthForm.jsx both keep their own FIELD constant, and the repo's stated trigger
  for moving one into the design system is "copied verbatim into four files". We
  are three short, and this one has an error state none of the others need.
*/
const FIELD_BASE  = 'h-11 w-full max-w-xs rounded-xl bg-paper px-3.5 text-[14px] text-ink outline-none transition-colors'
const FIELD_IDLE  = 'border border-line focus:border-ink/40'
const FIELD_WRONG = 'border border-critical/60 focus:border-critical'

export default function DeleteAccountForm({ email }) {
  const [armed, setArmed]       = useState(false)
  const [value, setValue]       = useState('')
  // TWO states, not one. `mismatch` is about the box; `error` is about the
  // request. Merging them puts a red border and aria-invalid on the input when
  // the network failed, which blames the user's typing for our problem.
  const [mismatch, setMismatch] = useState(false)
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)

  const inputRef   = useRef(null)
  const triggerRef = useRef(null)

  // Focus lands in the box the moment it appears, so the next keystroke is the
  // confirmation rather than a hunt for where the page just grew.
  useEffect(() => { if (armed) inputRef.current?.focus() }, [armed])

  const disarm = () => {
    setArmed(false); setValue(''); setMismatch(false); setError('')
    // Focus goes back to the control that opened this. Without it a keyboard
    // user who backs out is dumped at the top of the document and has to tab the
    // whole page to reach the card they were standing in.
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const submit = async (e) => {
    e.preventDefault()

    // The button is disabled while this runs, but Enter in a text field submits
    // regardless of the button's state — the re-entrancy hole AuthForm.jsx
    // documents. There a second submit was a second sign-in. Here it is a second
    // delete.
    if (busy) return

    if (!matchesDeleteConfirmation(value)) {
      setMismatch(true)
      inputRef.current?.focus()
      return
    }

    setBusy(true); setMismatch(false); setError('')

    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: value }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not delete the account')

      /*
        A HARD navigation, not router.replace(). Two independent reasons, and
        either alone would be enough:

          1. @supabase/ssr caches ONE browser client per document, built with
             autoRefreshToken and cookie-backed storage. A client navigation
             keeps that instance and its refresh timer alive, still holding an
             in-memory session for a user row that no longer exists — and every
             path that saves a session writes the auth cookie straight back out,
             undoing the Set-Cookie the delete response just sent. proxy.js then
             sees a cookie on /login and bounces to /dashboard, which bounces
             back: exactly the loop app/auth/device-signout/route.js exists to
             prevent. A document load throws the module registry away, and the
             refresh timer with it.
          2. The RSC router cache still holds rendered /dashboard segments for an
             account that no longer exists. Back, forward or a stray sidebar
             click would repaint them.

        replace(), not assign(), so Settings is not one Back press away from a
        deleted account.

        The cost, named because it is real: SignOutButton.jsx warms /login with
        router.prefetch and a hard navigation cannot use that entry. The deletion
        pays one cold document load. There is no client state here worth keeping,
        and keeping any of it is the bug.
      */
      window.location.replace(data.redirect || '/login?deleted=1')
      return
    } catch (err) {
      setError(err.message)
      // NOT a finally. On success this component is only waiting for the
      // document to be replaced, and re-enabling the button in that gap makes a
      // finished delete look idle.
      setBusy(false)
    }
  }

  if (!armed) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line-soft pt-5">
        <Button ref={triggerRef} variant="danger" size="sm" icon="trash" onClick={() => setArmed(true)}>
          Delete my account…
        </Button>
        {/* The DeviceList idiom: a plain sentence beside the button, so nobody
            has to click to find out what clicking does. The ellipsis says the
            same thing in one character — this opens a step, it is not itself the
            delete. */}
        <p className="text-[13px] text-muted">You will be asked to type a word to confirm.</p>
      </div>
    )
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={e => { if (e.key === 'Escape' && !busy) disarm() }}
      aria-labelledby="delete-account-heading"
      className="mt-6 border-t border-line-soft pt-5"
    >
      {/* Label classes match ProfileForm.jsx rather than the shared <Field>,
          because Field cannot put an id on its hint and has no error slot — and
          ProfileForm is the other form on this same page.

          The label NAMES THE ACCOUNT. That is the "right there, named" half of
          the house rule; a modal usually carries it in its title, and arming in
          place has to carry it here instead. */}
      <label htmlFor="delete-confirm" className="mb-1.5 block text-[13px] font-medium text-ink-soft">
        Type <span className="font-semibold text-ink">{DELETE_CONFIRM_WORD}</span> to delete{' '}
        <span className="font-medium text-ink">{email}</span>
      </label>

      <input
        ref={inputRef}
        id="delete-confirm"
        name="delete-confirm"
        type="text"
        value={value}
        onChange={e => { setValue(e.target.value); if (mismatch) setMismatch(false) }}
        disabled={busy}
        /* A confirmation is typed, never suggested. autoCapitalize is the one
           that matters: iOS capitalises the first letter of a text field by
           default and would otherwise hand every phone user a "Delete" they did
           not type. */
        autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
        aria-describedby={`delete-confirm-hint${mismatch ? ' delete-confirm-mismatch' : ''}`}
        aria-invalid={mismatch || undefined}
        className={`${FIELD_BASE} ${mismatch ? FIELD_WRONG : FIELD_IDLE}`}
      />

      {/* NO PLACEHOLDER, deliberately: a faint "delete" sitting in the box is the
          answer pre-written in grey, and a hurried reader takes it for something
          already typed. The word lives in the label instead.

          The leniency is STATED rather than magic — and it is a contract with the
          route, which normalises through the same lib/delete-account.js. */}
      <p id="delete-confirm-hint" className="mt-2 text-[12px] text-muted">
        Case does not matter. Nothing is deleted until you press the button below.
      </p>

      {mismatch && (
        // role="alert" rather than moving focus: the message is announced where
        // it appears and the caret stays in the box being corrected.
        <p id="delete-confirm-mismatch" role="alert" className="mt-2 flex items-center gap-2 text-[13px] text-critical">
          <Icon name="ban" size={14} className="shrink-0" />
          Type {DELETE_CONFIRM_WORD} to confirm.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {/* Enabled even with an empty box. A disabled button has nowhere to hang
            an explanation, and the reason it would be dead — a trailing space,
            Caps Lock, an iOS autocapital — is invisible. It is also not the gate:
            the route re-checks the word, so disabling here would be the UI
            claiming to be a boundary it is not. A wrong submit costs nothing; it
            deletes nothing and fires no request. `busy` is the only state where a
            second press does harm. */}
        <Button type="submit" variant="danger" size="sm" disabled={busy}>
          {busy ? 'Deleting…' : 'Delete my account permanently'}
        </Button>

        {/* "Keep my account", not "Cancel" — InterviewProfiles.jsx: "Cancel
            sitting next to Delete is ambiguous about which of the two it
            cancels." Plain text rather than a second <Button>, per DeviceList:
            two pills of equal weight is how the wrong one gets pressed.

            type="button" is LOAD-BEARING. A bare <button> inside a <form>
            defaults to submit — the trap AuthForm.jsx documents for its password
            toggle — so without it, backing out deletes the account. */}
        <button
          type="button" onClick={disarm} disabled={busy}
          className="text-[13px] text-muted transition-colors hover:text-ink disabled:opacity-40"
        >
          Keep my account
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-4 flex items-center gap-2 text-[13px] text-critical">
          <Icon name="ban" size={14} className="shrink-0" />{error}
        </p>
      )}
    </form>
  )
}
