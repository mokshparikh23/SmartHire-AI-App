'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import Icon from '@/components/ui/Icon'
import { Button } from '@/components/ui'

const FIELD =
  'w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-[14px] text-ink ' +
  'placeholder:text-faint outline-none transition-colors ' +
  'focus:border-ink/40 focus-visible:outline-none'

function Field({ label, hint, ...props }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={props.name} className="text-[13px] font-medium text-ink-soft">{label}</label>
        {hint}
      </div>
      <input id={props.name} className={FIELD} {...props} />
    </div>
  )
}

export default function AuthForm({ mode }) {
  const router   = useRouter()
  const supabase = createClient()
  const isLogin  = mode === 'login'

  const [form, setForm]       = useState({ email: '', password: '', full_name: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email:    form.email,
          password: form.password,
        })
        if (error) throw error
        router.push('/dashboard')
        router.refresh()
      } else {
        const { error } = await supabase.auth.signUp({
          email:    form.email,
          password: form.password,
          options:  { data: { full_name: form.full_name } },
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
        <Link
          href="/login"
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
        <Link href={isLogin ? '/signup' : '/login'} className="font-medium text-ink underline underline-offset-4 hover:text-accent">
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

        <Field
          label="Password" name="password" type="password" required minLength={6}
          value={form.password} onChange={handleChange} placeholder="At least 6 characters"
          autoComplete={isLogin ? 'current-password' : 'new-password'}
        />

        {error && (
          <p className="flex items-start gap-2 rounded-xl bg-critical-soft px-3.5 py-3 text-[13px] text-critical">
            <Icon name="ban" size={15} className="mt-px shrink-0" />
            {error}
          </p>
        )}

        <Button type="submit" disabled={loading} size="lg" className="w-full">
          {loading ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-4">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[12px] text-faint">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        onClick={async () => {
          await createClient().auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/auth/callback` },
          })
        }}
        className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-line bg-paper text-[15px] font-medium text-ink transition-colors hover:bg-canvas"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>
    </div>
  )
}
