'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { CONTROL, CONTROL_PADLESS } from '@/components/ui'
import Icon from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/Skeleton'
import { companyLookupEnabled, logoUrl, searchCompanies } from '@/lib/company'
import CompanyLogo from './CompanyLogo'

/*
  RESUME-UPLOAD 2026-08-30

  Company name with live suggestions, logo and domain.

  Picking a suggestion stores the NAME and the DOMAIN. It does not store a logo
  URL — see lib/company.js for why: Brandfetch's search icons expire after 24
  hours and their terms forbid persisting them, so the row keeps the domain and
  the logo is rebuilt from it on every render.

  Typing and never picking is a first-class outcome, not a fallback. Plenty of
  real companies are not in anyone's brand index, and the interview does not need
  a logo — so this must always behave at least as well as the plain text input it
  replaces, and must never be able to block a save.
*/
export default function CompanyCombobox({ name, domain, onChange, id, placeholder = 'TCS' }) {
  const listId = useId()
  const inputId = id || `${listId}-input`
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [state, setState] = useState('idle')   // idle | loading | ok | empty | error

  const enabled = companyLookupEnabled()
  const selectedLogo = logoUrl(domain, 48)

  /* Debounce + abort.

     220ms: long enough that a fast typist fires roughly one request per word,
     short enough that the list still feels attached to the keystroke.
     Brandfetch's guidelines ask for a debounce explicitly, and their limit is
     200 requests per 5 minutes per IP — undebounced, one paragraph of typing
     would burn it.

     The AbortController does double duty: it cancels the in-flight request AND
     guarantees an older response cannot land after a newer one and overwrite it. */
  useEffect(() => {
    if (!enabled) return
    const q = (name || '').trim()
    if (q.length < 2) { setItems([]); setState('idle'); return }
    // Do not re-search the thing the user just picked — that would pop a
    // dropdown over a field nobody touched, every time the form re-opens.
    if (domain) return

    const ac = new AbortController()
    setState('loading')

    const t = setTimeout(async () => {
      try {
        const results = await searchCompanies(q, { signal: ac.signal })
        setItems(results)
        setState(results.length ? 'ok' : 'empty')
        setActive(-1)
      } catch (e) {
        // Every keystroke aborts the previous request. Without this guard the
        // dropdown flashes its error row on every single letter typed.
        if (e?.name === 'AbortError') return
        setItems([])
        setState('error')
      }
    }, 220)

    return () => { clearTimeout(t); ac.abort() }
  }, [name, domain, enabled])

  // Close on outside click. pointerdown, not click, so it fires before focus moves.
  useEffect(() => {
    if (!open) return
    const away = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  // No `behavior`, so it is instant by default and there is nothing for the
  // global reduced-motion block to suppress.
  useEffect(() => {
    if (active < 0) return
    document.getElementById(`${listId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, listId])

  const pick = (c) => {
    onChange({ name: c.name, domain: c.domain })
    setOpen(false)
    setActive(-1)
  }

  const onInput = (e) => {
    const next = e.target.value
    setOpen(true)
    /* Any edit that moves the text off the picked company drops the mark with
       it. A Google logo sitting beside the word "Googlx" is worse than no logo. */
    onChange({ name: next, domain: next === name ? domain : '' })
  }

  const onKeyDown = (e) => {
    if (!enabled) return

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()                      // stop the caret jumping to line start/end
      if (!open) { setOpen(true); return }
      const n = items.length
      if (!n) return
      setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % n : i <= 0 ? n - 1 : i - 1))
      return
    }
    if (open && e.key === 'Home') { e.preventDefault(); setActive(0); return }
    if (open && e.key === 'End')  { e.preventDefault(); setActive(items.length - 1); return }

    if (e.key === 'Enter') {
      // preventDefault only when actually consuming it. There is no <form> here
      // today, but one is the right eventual shape and this must not submit it
      // mid-selection.
      if (open && active >= 0 && items[active]) { e.preventDefault(); pick(items[active]) }
      return
    }
    if (e.key === 'Escape') {
      // stopPropagation so Esc closes the LIST, not the form behind it.
      if (open) { e.stopPropagation(); setOpen(false); setActive(-1) }
      return
    }
    if (e.key === 'Tab') {
      // No preventDefault — focus still moves on. Tab commits a highlighted
      // option, which is what every other autocomplete does.
      if (open && active >= 0 && items[active]) pick(items[active])
      setOpen(false)
    }
  }

  // Without a client id this is exactly the input it replaced.
  if (!enabled) {
    return (
      <input id={inputId} className={CONTROL} value={name} placeholder={placeholder}
        onChange={(e) => onChange({ name: e.target.value, domain: '' })} />
    )
  }

  return (
    <div className="relative" ref={wrapRef}>
      {selectedLogo
        ? <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
            <CompanyLogo src={selectedLogo} name={name} size={22} />
          </span>
        : <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">
            <Icon name="search" size={16} />
          </span>}

      <input
        id={inputId}
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-opt-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        className={`${CONTROL_PADLESS} ${selectedLogo ? 'pl-10' : 'pl-9'} pr-9`}
        value={name}
        placeholder={placeholder}
        onChange={onInput}
        onFocus={() => { if (!domain && (name || '').trim().length >= 2) setOpen(true) }}
        onKeyDown={onKeyDown}
      />

      {domain && (
        <button
          type="button"
          // Clears the mark but KEEPS the typed name — wiping the text too would
          // be a surprising amount of destruction for a small ✕.
          onClick={() => { onChange({ name, domain: '' }); inputRef.current?.focus() }}
          aria-label={`Remove the ${name} logo`}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-faint transition-colors hover:bg-canvas-2 hover:text-ink"
        >
          <Icon name="close" size={14} />
        </button>
      )}

      {open && state !== 'idle' && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Companies"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-72 overflow-y-auto rounded-xl border border-line bg-paper p-1 shadow-[0_12px_32px_-12px_rgba(22,22,26,0.18)]"
        >
          {state === 'loading' && items.length === 0 && (
            <li className="flex items-center gap-3 px-2.5 py-2">
              <Skeleton className="h-6 w-6 rounded-md" />
              <Skeleton className="h-[13px] w-32" />
            </li>
          )}

          {state === 'empty' && (
            <li className="px-3 py-3 text-[13px] text-muted">
              No match for “{(name || '').trim()}”.
              <span className="mt-1 block text-faint">What you typed is kept as the company name.</span>
            </li>
          )}

          {state === 'error' && (
            <li className="flex items-start gap-2 px-3 py-3 text-[13px] text-muted">
              <Icon name="warning" size={14} className="mt-0.5 shrink-0 text-warning" />
              Lookup is unavailable. Type the name — the interview does not need the logo.
            </li>
          )}

          {items.map((c, i) => (
            <li
              key={c.domain}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              // Keeps focus in the input: without it, blur closes the list and
              // unmounts this row before the click can land on it.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(c)}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 ${i === active ? 'bg-canvas-2' : ''}`}
            >
              <CompanyLogo src={c.icon} name={c.name} size={24} />
              {/* flex-1 on the name rather than justify-between, so a long name
                  truncates instead of colliding with the domain. */}
              <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{c.name}</span>
              <span className="mono shrink-0 text-[12px] text-faint">{c.domain}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
