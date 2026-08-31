'use client'

import { useEffect } from 'react'
import { Button } from 'smarthire-ui'

export default function AuthError({ error, retry }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <div>
      <h1 className="display text-[2rem] text-ink">Something went wrong.</h1>
      <p className="mt-4 text-[14px] leading-relaxed text-muted">
        We could not load the sign-in form. This is usually a connection problem rather
        than anything wrong with your account.
      </p>
      <Button onClick={() => retry()} size="lg" className="mt-8 w-full">Try again</Button>
    </div>
  )
}
