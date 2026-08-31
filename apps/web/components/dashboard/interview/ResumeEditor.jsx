'use client'

import { useRef } from 'react'
import { Button, Field, CONTROL } from 'smarthire-ui'
import Icon from 'smarthire-ui/Icon'
import { blankEntry } from '@/lib/resume'

/*
  RESUME-UPLOAD 2026-08-30

  The parsed résumé, as editable fields.

  ON THE REFERENCE DESIGN: this reproduces ParakeetAI's structure — Personal
  Details, Introduction, Education, Job Experience, Other Experience, each
  repeatable — and deliberately not its styling. That uses centred, emoji-headed
  sections (📝 Title, 🎓 Education); this codebase forbids emoji outright, for
  the reasons in the Icon.jsx docblock. The emoji-free equivalent already exists
  in globals.css: `.eyebrow`, in a sticky left rail.

  The rail is not decoration. Thirty-odd fields in one column is a wall; with the
  section label pinned beside them, you always know which of five job entries you
  are looking at while scrolling.
*/

function Section({ label, count, children }) {
  return (
    <section className="border-t border-line-soft pt-6 first:border-0 first:pt-0">
      <div className="grid gap-5 sm:grid-cols-[132px_1fr]">
        {/*
          self-start is load-bearing, not tidiness: a grid item stretches to the
          row height by default, so `sticky` would have nothing to slide against
          and the label would just sit at the top of a full-height box. Same trap
          noted in the Sidebar's LAYOUT FIX.
        */}
        <div className="sm:sticky sm:top-4 sm:self-start">
          <h3 className="eyebrow">{label}</h3>
          {typeof count === 'number' && count > 0 && (
            <p className="mono mt-1.5 text-[11px] text-faint" data-numeric>
              {count} {count === 1 ? 'entry' : 'entries'}
            </p>
          )}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  )
}

function Entry({ index, title, onDelete, children }) {
  return (
    <div className="rounded-xl border border-line bg-canvas p-4">
      <div className="mb-3 flex items-center gap-3">
        {/* Echoes .marker-no from globals.css without importing marketing CSS.
            The number plus a live title is what makes five near-identical cards
            navigable — you can find "the Infosys one" without reading them all. */}
        <span
          className="mono rounded-md border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink-soft"
          data-numeric
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
          {title || 'Untitled'}
        </p>
        {/* Nine identical "Delete" buttons is an unusable screen-reader list. */}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${title || `entry ${index + 1}`}`}
          className="shrink-0 rounded-lg p-1.5 text-faint transition-colors hover:bg-critical-soft hover:text-critical"
        >
          <Icon name="trash" size={15} />
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  )
}

/** Full-width cell inside Entry's two-column grid. */
const Wide = ({ children }) => <div className="sm:col-span-2">{children}</div>

const Empty = ({ children }) => <p className="text-[13px] text-muted">{children}</p>

/*
  Module level, NOT nested inside ResumeEditor. A component declared in a render
  body is a new type on every render, so React unmounts and remounts it — which
  would drop the ref below on each keystroke and defeat the whole point of
  moving focus here after a delete.
*/
function AddButton({ innerRef, onClick, children }) {
  return (
    <div className="mt-3">
      <Button ref={innerRef} size="sm" variant="secondary" icon="plus" onClick={onClick}>
        {children}
      </Button>
    </div>
  )
}

export default function ResumeEditor({ value, onChange }) {
  /* One ref per section's Add button. After deleting an entry, focus has to land
     somewhere deliberate — otherwise it falls to <body> and a keyboard user is
     dumped at the top of the page mid-edit. */
  const addRefs = useRef({})

  const setPersonal = (k, v) =>
    onChange({ ...value, personal: { ...value.personal, [k]: v } })

  const setIn = (kind, i, k, v) =>
    onChange({
      ...value,
      [kind]: value[kind].map((e, n) => (n === i ? { ...e, [k]: v } : e)),
    })

  const add = (kind) =>
    onChange({ ...value, [kind]: [...value[kind], blankEntry(kind)] })

  const removeAt = (kind, i) => {
    onChange({ ...value, [kind]: value[kind].filter((_, n) => n !== i) })
    // The list re-renders without the row that held focus, so move it forward.
    requestAnimationFrame(() => addRefs.current[kind]?.focus())
  }

  const addRef = (kind) => (el) => { addRefs.current[kind] = el }

  return (
    <div className="space-y-6">
      <Section label="Personal details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input className={CONTROL} value={value.personal.name}
              onChange={(e) => setPersonal('name', e.target.value)} placeholder="Priya Sharma" />
          </Field>
          <Field label="Email">
            <input className={CONTROL} type="email" value={value.personal.email}
              onChange={(e) => setPersonal('email', e.target.value)} placeholder="priya@example.com" />
          </Field>
          <Field label="Phone">
            <input className={CONTROL} value={value.personal.phone}
              onChange={(e) => setPersonal('phone', e.target.value)} placeholder="+91 98765 43210" />
          </Field>
          {/* Addresses wrap badly in a half column. */}
          <Wide>
            <Field label="Address">
              <input className={CONTROL} value={value.personal.address}
                onChange={(e) => setPersonal('address', e.target.value)} placeholder="Bengaluru, India" />
            </Field>
          </Wide>
        </div>
      </Section>

      <Section label="Introduction">
        <Field label="Summary" hint="The opening the copilot reads first.">
          <textarea
            className={`${CONTROL} h-28 resize-y py-3 leading-relaxed`}
            value={value.introduction}
            onChange={(e) => onChange({ ...value, introduction: e.target.value })}
            placeholder="Backend engineer, eight years, mostly payments infrastructure."
          />
        </Field>
      </Section>

      <Section label="Job experience" count={value.jobs.length}>
        <div className="space-y-3">
          {value.jobs.map((job, i) => (
            <Entry key={job.id} index={i} title={job.company} onDelete={() => removeAt('jobs', i)}>
              <Field label="Company">
                <input className={CONTROL} value={job.company}
                  onChange={(e) => setIn('jobs', i, 'company', e.target.value)} />
              </Field>
              <Field label="Position">
                <input className={CONTROL} value={job.position}
                  onChange={(e) => setIn('jobs', i, 'position', e.target.value)} />
              </Field>
              <Field label="Time period">
                <input className={CONTROL} value={job.period} placeholder="Mar 2025 — Present"
                  onChange={(e) => setIn('jobs', i, 'period', e.target.value)} />
              </Field>
              <Field label="Location">
                <input className={CONTROL} value={job.location}
                  onChange={(e) => setIn('jobs', i, 'location', e.target.value)} />
              </Field>
              <Wide>
                <Field label="Description">
                  <textarea className={`${CONTROL} h-24 resize-y py-3 leading-relaxed`} value={job.description}
                    onChange={(e) => setIn('jobs', i, 'description', e.target.value)} />
                </Field>
              </Wide>
            </Entry>
          ))}
          {value.jobs.length === 0 && (
            <Empty>Nothing found in the résumé. Add a job if you want the copilot to know about one.</Empty>
          )}
        </div>
        <AddButton innerRef={addRef('jobs')} onClick={() => add('jobs')}>Add job</AddButton>
      </Section>

      <Section label="Education" count={value.education.length}>
        <div className="space-y-3">
          {value.education.map((ed, i) => (
            <Entry key={ed.id} index={i} title={ed.school} onDelete={() => removeAt('education', i)}>
              <Field label="School">
                <input className={CONTROL} value={ed.school}
                  onChange={(e) => setIn('education', i, 'school', e.target.value)} />
              </Field>
              <Field label="Degree">
                <input className={CONTROL} value={ed.degree}
                  onChange={(e) => setIn('education', i, 'degree', e.target.value)} />
              </Field>
              <Field label="Time period">
                <input className={CONTROL} value={ed.period} placeholder="2016 — 2020"
                  onChange={(e) => setIn('education', i, 'period', e.target.value)} />
              </Field>
              <Field label="Location">
                <input className={CONTROL} value={ed.location}
                  onChange={(e) => setIn('education', i, 'location', e.target.value)} />
              </Field>
              <Wide>
                <Field label="Description">
                  <textarea className={`${CONTROL} h-20 resize-y py-3 leading-relaxed`} value={ed.description}
                    onChange={(e) => setIn('education', i, 'description', e.target.value)} />
                </Field>
              </Wide>
            </Entry>
          ))}
          {value.education.length === 0 && <Empty>No education found in the résumé.</Empty>}
        </div>
        <AddButton innerRef={addRef('education')} onClick={() => add('education')}>Add education</AddButton>
      </Section>

      <Section label="Other experience" count={value.other.length}>
        <div className="space-y-3">
          {value.other.map((o, i) => (
            <Entry key={o.id} index={i} title={o.title} onDelete={() => removeAt('other', i)}>
              <Wide>
                <Field label="Title" hint="Skills, certifications, projects, awards.">
                  <input className={CONTROL} value={o.title}
                    onChange={(e) => setIn('other', i, 'title', e.target.value)} />
                </Field>
              </Wide>
              <Wide>
                <Field label="Description">
                  <textarea className={`${CONTROL} h-24 resize-y py-3 leading-relaxed`} value={o.description}
                    onChange={(e) => setIn('other', i, 'description', e.target.value)} />
                </Field>
              </Wide>
            </Entry>
          ))}
          {value.other.length === 0 && <Empty>No skills or certifications found in the résumé.</Empty>}
        </div>
        <AddButton innerRef={addRef('other')} onClick={() => add('other')}>Add section</AddButton>
      </Section>
    </div>
  )
}

/**
 * Shown while the PDF is being read.
 *
 * Renders the REAL section labels and the real spacing, greying only the field
 * boxes, so the swap from parsing to parsed has nothing to jump. A generic block
 * of grey bars would reflow the moment the content arrived.
 */
export function ResumeEditorSkeleton({ className = '' }) {
  const Bar = ({ className: c = '' }) => (
    <div className={`animate-pulse rounded-xl bg-canvas-2 ${c}`} />
  )
  return (
    <div className={`space-y-6 ${className}`} aria-hidden="true">
      {[['Personal details', 2], ['Introduction', 1], ['Job experience', 2]].map(([label, rows]) => (
        <section key={label} className="border-t border-line-soft pt-6 first:border-0 first:pt-0">
          <div className="grid gap-5 sm:grid-cols-[132px_1fr]">
            <div className="sm:self-start"><h3 className="eyebrow">{label}</h3></div>
            <div className="min-w-0 space-y-3">
              {Array.from({ length: rows }, (_, i) => <Bar key={i} className="h-11 w-full" />)}
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}
