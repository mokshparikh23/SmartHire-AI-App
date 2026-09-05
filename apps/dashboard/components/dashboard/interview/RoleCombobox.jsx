'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CONTROL_PADLESS } from '@smarthire/ui'
import Icon from '@smarthire/ui/Icon'
import { searchRoles, sameRole } from '@/lib/roles'

/*
  ROLE-SUGGEST 2026-09-01

  Job title with suggestions. Was a plain <input> in InterviewForm.jsx.

  A DELIBERATELY SMALLER SIBLING OF CompanyCombobox. The keyboard model, the
  outside-click close and the ARIA wiring are the same on purpose — two adjacent
  fields that both drop a list must not answer the arrow keys differently — but
  everything the network forced on that component is gone: no debounce, no
  AbortController, no loading skeleton, no error row, and no "lookup disabled"
  branch. lib/roles.js is a local array, so a match is a synchronous filter and
  there is no state in which this field can fail to work.

  The other difference is what a selection MEANS. Picking a company stores a
  second, invisible value — the domain the logo is rebuilt from — which is why
  that component has to watch for edits that move the text off the picked company
  and drop the mark. A role is only ever the string in the box. Picking from the
  list and typing the same letters by hand produce identical state, so there is
  nothing here to keep in sync and nothing to invalidate.

  Which is the whole point: the list is a shortcut, never a constraint. Anything
  the user types is the role, whether it is on the list or not, and the empty
  state says so rather than leaving them guessing.
*/
export default function RoleCombobox({ value, onChange, id, placeholder = 'SDE2' }) {
  const listId = useId()
  const inputId = id || `${listId}-input`
  const wrapRef = useRef(null)

  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  // Cheap enough to run unmemoised over ~50 strings, but this also runs on every
  // keystroke of every other field in the form, since InterviewForm re-renders
  // on one shared `value` object.
  const items = useMemo(() => searchRoles(value), [value])

  const typed = (value || '').trim()

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

  /* The highlight is reset whenever the list it indexes into changes. Without
     this, typing one more letter after arrowing down leaves `active` pointing at
     a row that is now a different role — and Enter would commit whatever slid
     into that position. */
  useEffect(() => { setActive(-1) }, [items])

  const pick = (role) => {
    onChange(role)
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (e) => {
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

  return (
    <div className="relative" ref={wrapRef}>
      {/* The same left-hand search mark the company field wears when it has no
          logo. These two sit side by side in one grid row, and matching the
          affordance is how the reader learns that both fields suggest without
          either of them having to say so. */}
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">
        <Icon name="search" size={16} />
      </span>

      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-opt-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        className={`${CONTROL_PADLESS} pl-9 pr-3.5`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => { setOpen(true); onChange(e.target.value) }}
        /* Opens on focus unconditionally, unlike the company field's `>= 2
           characters` guard. That guard is there because a search costs a
           request and two letters is the point one stops being noise. Nothing is
           spent here, and the empty field is exactly the case this whole change
           exists for: the user who does not know what to type gets the list. */
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Roles"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-72 overflow-y-auto rounded-xl border border-line bg-paper p-1 shadow-[0_12px_32px_-12px_rgba(22,22,26,0.18)]"
        >
          {/* Same wording as the company field's empty row, and for the same
              reason: the only thing worth saying is that nothing was lost. */}
          {items.length === 0 && (
            <li className="px-3 py-3 text-[13px] text-muted">
              No match for “{typed}”.
              <span className="mt-1 block text-faint">What you typed is kept as the role.</span>
            </li>
          )}

          {items.map((role, i) => {
            const current = sameRole(value, role)
            return (
              <li
                key={role}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                // Keeps focus in the input: without it, blur closes the list and
                // unmounts this row before the click can land on it.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(role)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 ${i === active ? 'bg-canvas-2' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{role}</span>
                {/* Reopening the list on a saved interview should show which row
                    the field is already sitting on. sameRole, not ===, so a row
                    saved as "SDE2" still ticks "SDE 2". */}
                {current && <Icon name="check" size={14} className="shrink-0 text-muted" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
