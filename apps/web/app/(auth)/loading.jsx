import { Skeleton } from '@/components/ui/Skeleton'

// /login and /signup render the same shell, so one fallback covers both. The
// editorial panel is part of the layout and stays put; only the form is greyed.
export default function AuthLoading() {
  return (
    <div>
      <Skeleton className="h-[2.08rem] w-56" />
      <Skeleton className="mt-3 h-[14px] w-64" />
      <div className="mt-8 space-y-4">
        <Skeleton className="h-[62px] w-full rounded-xl" />
        <Skeleton className="h-[62px] w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-full" />
      </div>
    </div>
  )
}
