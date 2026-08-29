import { Skeleton, StatSkeleton, CardSkeleton } from '@/components/ui/Skeleton'

/*
  Two jobs.

  1. The Overview skeleton.
  2. The cold-prefetch safety net for every other dashboard route. Without a
     loading file at this level the layout's `children` slot gets no Suspense
     boundary at all, so a navigation to a route whose own segment has not been
     prefetched suspends past the layout and freezes the entire screen — which is
     the reported bug.

  It also re-enables prefetching: Next skips prefetching a dynamic route unless
  the tree contains a Loading component (create-component-tree.js:337-370).

  The title is a grey bar rather than the literal string "Welcome back.", because
  the real header is `Welcome back, {firstName}.` whenever a profile exists —
  rendering the short form here would shift the text sideways on swap.
*/
export default function DashboardLoading() {
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Skeleton className="h-[2.08rem] w-72" />
          <p className="mt-1.5 text-[14px] text-muted">Your balance, your key, and where the time went.</p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
      </div>

      <CardSkeleton className="mt-5" lines={3} />
    </div>
  )
}
