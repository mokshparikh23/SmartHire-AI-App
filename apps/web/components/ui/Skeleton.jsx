// SPLIT 2026-09-01: the barrel moved to packages/ui; this file stayed, because
// its only consumers are the dashboard's loading.jsx files.
// import { Card } from './index'
import { Card } from 'smarthire-ui'

/*
  Loading placeholders.

  The rule these follow, and the reason they are hand-shaped rather than generic
  grey boxes: a skeleton must reproduce the page's CHROME with real text and real
  spacing, and grey only the data. If the skeleton and the real page disagree
  about padding, border or line height, the swap visibly jumps — which reads as
  worse than no skeleton at all.

  So the page headers in every loading.jsx below render their real strings, and
  only values that require a round trip are greyed.
*/

/** One grey bar. Widths vary at the call site so a stack reads as text, not bars. */
export function Skeleton({ className = '' }) {
  return <span className={`block animate-pulse rounded-md bg-canvas-2 ${className}`} />
}

/** Matches <Stat>: same flex column, same gap, same 2rem display line box. */
export function StatSkeleton() {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <Skeleton className="h-[11px] w-16" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <div>
        {/* 2rem at line-height 1.04 — reproduces `.display text-[2rem]` exactly. */}
        <Skeleton className="h-[2.08rem] w-24" />
        <Skeleton className="mt-1 h-[13px] w-28" />
      </div>
    </Card>
  )
}

/**
 * Matches <Card> with a heading and n body lines. Widths taper so it reads as a
 * paragraph; a column of identical bars looks like a table.
 */
const LINE_WIDTHS = ['w-full', 'w-11/12', 'w-4/5', 'w-full', 'w-3/4', 'w-5/6']

export function CardSkeleton({ lines = 3, className = '' }) {
  return (
    <Card className={className}>
      <Skeleton className="h-[15px] w-40" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={`h-[14px] ${LINE_WIDTHS[i % LINE_WIDTHS.length]}`} />
        ))}
      </div>
    </Card>
  )
}

/** One table row. h-[45px] matches px-6 py-3.5 at text-[14px]. */
export function RowSkeleton({ cols = 3 }) {
  return (
    <div className="flex h-[45px] items-center gap-4 px-6">
      {Array.from({ length: cols }, (_, i) => (
        <Skeleton key={i} className={`h-[13px] ${i === 0 ? 'w-40' : 'w-24'}`} />
      ))}
    </div>
  )
}
