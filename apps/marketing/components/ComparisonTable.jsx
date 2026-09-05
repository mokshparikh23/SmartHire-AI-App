import Icon from '@smarthire/ui/Icon'
import { US, LEGEND } from '@/lib/comparison'

/*
  The feature grid.

  A SERVER COMPONENT, deliberately. Everything that makes this table readable —
  the pinned first column, the highlighted "us" column, the group headings — is
  CSS. Shipping a client bundle to make a table hoverable would be the tail
  wagging the dog on the one page most likely to be opened, skimmed and closed.

  WHY THE HEADER ROW IS NOT STICKY. The wrapper needs `overflow-x: auto` so the
  grid can scroll sideways on a phone, and per the CSS overflow spec an `auto` on
  one axis computes the `visible` on the other axis to `auto` as well. That makes
  the wrapper a scroll container in BOTH directions, so a `position: sticky`
  header inside it sticks to the wrapper's own box rather than to the viewport —
  which looks like nothing happening at all. The fix is the group headings: three
  labelled bands, each short enough that the column names are still on screen.

  The FIRST column is sticky, and that one does work, because it sticks along the
  axis the wrapper actually scrolls.
*/

/** Row heights are set on the label cell so every column agrees on them. */
const CELL = 'px-4 py-4 text-center align-middle sm:px-5'

/**
 * The label under each product name, keyed by `side` in lib/comparison.js.
 *
 * CONCEPT 2026-08-30: 'both' is ours — the desktop app ships answerPrompt() and
 * the follow-up prompt behind one switch. Kept short because the header cell is
 * `whitespace-nowrap` and the table's 940px min-width is set against the longest
 * of these; a longer string here means checking that number again.
 */
const SIDE_LABEL = {
  asking:    'For asking',
  answering: 'For answering',
  // 'For both sides' is one character longer than the string the 940px
  // min-width was measured against. Short enough not to need re-checking it.
  both:      'For both',
}

/*
  The pinned label column.

  Its width is responsive for a reason that only shows up on a phone: at a flat
  15.5rem it took 248px of a 390px viewport, leaving about 100px of the grid
  actually visible beside it — a pinned column so wide it defeats the scrolling
  it exists to support. Narrower below `sm`, where the labels still fit on two
  lines.
*/
const LABEL_COL = 'w-[10.5rem] min-w-[10.5rem] sm:w-[15.5rem] sm:min-w-[15.5rem]'

/*
  Mark rendering.

  Each mark carries an sr-only word. A screen reader meeting a bare ✓/✗ column
  gets "check, check, cross, check" with no idea which product it is looking at,
  so the word is the whole accessibility story for this table.
*/
const MARKS = {
  yes: {
    label: 'Yes',
    render: (us) => (
      <span
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
          us ? 'bg-ink text-paper' : 'bg-positive-soft text-positive'
        }`}
      >
        <Icon name="check" size={14} />
      </span>
    ),
  },
  no: {
    label: 'No',
    render: () => (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-canvas-2 text-faint">
        <Icon name="close" size={13} />
      </span>
    ),
  },
  partial: {
    label: 'Partly',
    render: () => (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-warning-soft text-warning">
        <Icon name="warning" size={14} />
      </span>
    ),
  },
  unknown: {
    label: 'Not stated',
    render: () => <span className="mono text-[13px] text-faint">?</span>,
  },
  na: {
    label: 'Not applicable',
    render: () => <span className="text-[15px] text-line">—</span>,
  },
}

function Cell({ value, note, us }) {
  const mark = MARKS[value]

  return (
    <td className={`${CELL} ${us ? 'bg-canvas' : ''}`}>
      {mark ? (
        <>
          {mark.render(us)}
          <span className="sr-only">{mark.label}</span>
        </>
      ) : (
        // Anything that is not one of the five marks is literal text — a price,
        // a "best for", a tax line. Kept at the same size as the body so a text
        // cell does not shout over a column of ticks.
        <span className={`text-[13.5px] leading-snug ${us ? 'font-medium text-ink' : 'text-ink-soft'}`}>
          {value}
        </span>
      )}

      {note && (
        <span className="mt-1.5 block text-[11.5px] leading-snug text-faint">{note}</span>
      )}
    </td>
  )
}

export default function ComparisonTable({ columns, groups }) {
  return (
    <div>
      {/*
        The mask is the scroll affordance. Below the breakpoint where all six
        columns fit, the right edge fades — which reads as "there is more" far
        better than a scrollbar the platform may not even draw. Same technique as
        the platforms strip on the landing page.
      */}
      {/* `.x-scroll-fade` is in globals.css rather than an inline style because
          it has to switch OFF at the width where the table stops overflowing —
          see the note there. */}
      <div className="x-scroll-fade overflow-x-auto rounded-2xl border border-line bg-paper">
        {/* 940px, not 880: the header's "FOR ANSWERING" label is nowrap, and at
            880 the five data columns were narrow enough to clip it. This is the
            number the 1024px breakpoint in `.x-scroll-fade` is chosen against —
            change one and check the other. */}
        <table className="w-full min-w-[940px] border-collapse text-left">
          <caption className="sr-only">
            Smart Hire AI compared with four other AI interview tools, by feature and price.
          </caption>

          <thead>
            <tr className="border-b border-line">
              {/* Empty corner. `left-0` pins it so the label column's header
                  does not slide out from over the labels themselves. */}
              <th
                scope="col"
                className={`sticky left-0 z-20 bg-paper px-4 py-5 sm:px-5 ${LABEL_COL}`}
              >
                <span className="marker-label">Feature</span>
              </th>

              {columns.map(col => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-5 py-5 text-center align-bottom ${col.us ? 'bg-canvas' : ''}`}
                >
                  <span
                    className={`block text-[14.5px] font-semibold ${col.us ? 'text-ink' : 'text-ink-soft'}`}
                  >
                    {col.name}
                  </span>
                  {/* whitespace-nowrap: "FOR ANSWERING" wrapped to two lines in
                      the three narrowest columns and stayed on one in the
                      others, which pushed those product names up by a line and
                      left the header row looking misaligned. The table's
                      min-width below is set so this always fits. */}
                  <span
                    className={`mono mt-1.5 block whitespace-nowrap text-[10px] uppercase tracking-[0.12em] ${
                      col.us ? 'text-ink' : 'text-faint'
                    }`}
                  >
                    {/* CONCEPT 2026-08-30: 'both' added for our own column — the
                        app ships an answer mode and a follow-up mode, so neither
                        of the two original labels was true of it. Written as a
                        lookup rather than a nested ternary so a future `side`
                        value falls back to something readable instead of
                        silently being labelled "for answering".
                        {col.side === 'asking' ? 'For asking' : 'For answering'} */}
                    {SIDE_LABEL[col.side] ?? 'For answering'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          {/* One tbody per group, so the grouping is structural rather than a
              styled row that happens to sit in the middle of a flat list. */}
          {groups.map(group => (
            <tbody key={group.title}>
              <tr className="border-b border-line bg-canvas-2/60">
                <th
                  scope="colgroup"
                  colSpan={columns.length + 1}
                  className="px-4 py-3 text-left sm:px-5"
                >
                  {/* The STICKY IS ON THE SPAN, not on the cell. A cell that
                      spans every column is already as wide as the table, so
                      pinning it does nothing — it has nowhere to slide. Pinning
                      the text inside it is what keeps the group name on screen
                      once the grid is scrolled right, which is exactly when a
                      reader has lost track of which group they are in. */}
                  <span className="mono sticky left-4 inline-block text-[11px] uppercase tracking-[0.16em] text-ink sm:left-5">
                    {group.title}
                  </span>
                </th>
              </tr>

              {group.rows.map(row => (
                <tr key={row.label} className="border-b border-line-soft last:border-b-0">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-paper px-4 py-4 text-[13px] font-medium text-ink sm:px-5 sm:text-[13.5px]"
                  >
                    {row.label}
                  </th>

                  {columns.map(col => (
                    <Cell
                      key={col.key}
                      value={row.values[col.key]}
                      note={row.notes?.[col.key]}
                      us={col.key === US}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <ul className="mt-6 flex flex-wrap gap-x-7 gap-y-3">
        {LEGEND.map(([key, text]) => (
          <li key={key} className="flex items-center gap-2 text-[12.5px] text-muted">
            {/* inline-flex, not a bare span: `transform` has no effect on a
                non-replaced inline box, so `scale-*` on a plain <span> is
                silently dropped and the legend marks stay full size. */}
            <span className="inline-flex scale-[0.78]">{MARKS[key].render(false)}</span>
            {text}
          </li>
        ))}
      </ul>
    </div>
  )
}
