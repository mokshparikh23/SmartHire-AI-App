import { Card, PageHeader } from 'smarthire-ui'
import { StatSkeleton, RowSkeleton } from '@/components/ui/Skeleton'
import PageTransition from '@/components/ui/PageTransition'

export default function SessionsLoading() {
  return (
    <PageTransition>
      <div>
        <PageHeader title="Sessions" lede="Every interview you have run, and the minutes it used." />

        <div className="grid gap-5 sm:grid-cols-3">
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </div>

        <Card className="mt-5" padded={false}>
          {/* The real table header renders for real — it holds no data. */}
          <div className="border-b border-line px-6 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Recent sessions</h2>
          </div>
          <div className="divide-y divide-line-soft">
            {Array.from({ length: 6 }, (_, i) => <RowSkeleton key={i} cols={4} />)}
          </div>
        </Card>
      </div>
    </PageTransition>
  )
}
