'use client'

import { useRef, useState } from 'react'
import Icon from 'smarthire-ui/Icon'

/**
 * One-open-at-a-time FAQ list.
 *
 * REDESIGN 2026-08-30: replaces the flat <dl> that listed every answer at once.
 * Ten expanded answers is a wall of text nobody reads; collapsed, the questions
 * themselves become a scannable index.
 *
 * The panel animates on max-height rather than height so the CSS never needs a
 * measured pixel value — `max-h-0` to a generous ceiling covers every answer
 * here, and the transition still reads as a reveal. Height animation would mean
 * measuring each panel on mount and again on resize.
 *
 * Accessibility: a real <button> with aria-expanded and aria-controls, and the
 * panel is hidden with `invisible` rather than `display:none` so the max-height
 * transition has something to animate. `inert` keeps collapsed content out of
 * the tab order in browsers that support it.
 */
export default function FaqAccordion({ items }) {
  const [open, setOpen] = useState(null)

  return (
    <div className="border-t border-line">
      {items.map(([q, a], i) => (
        <Row
          key={q}
          index={i}
          question={q}
          answer={a}
          open={open === i}
          onToggle={() => setOpen(open === i ? null : i)}
        />
      ))}
    </div>
  )
}

function Row({ index, question, answer, open, onToggle }) {
  const panelRef = useRef(null)
  const id = `faq-panel-${index}`

  return (
    <div className="border-b border-line">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="group grid w-full grid-cols-[1fr_2rem] items-center gap-6 py-6 text-left"
      >
        <span className="text-[15px] font-medium text-ink">{question}</span>
        <span
          aria-hidden="true"
          className={[
            'flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300',
            open
              ? 'rotate-45 border-ink bg-ink text-paper'
              : 'border-line text-ink group-hover:border-ink/30',
          ].join(' ')}
        >
          <Icon name="plus" size={15} />
        </span>
      </button>

      <div
        id={id}
        ref={panelRef}
        inert={!open}
        className={[
          'overflow-hidden transition-all duration-[400ms] ease-[cubic-bezier(0.22,0.9,0.28,1)]',
          open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0',
        ].join(' ')}
      >
        <p className="max-w-[74ch] pb-6 text-[14px] leading-relaxed text-muted">{answer}</p>
      </div>
    </div>
  )
}
