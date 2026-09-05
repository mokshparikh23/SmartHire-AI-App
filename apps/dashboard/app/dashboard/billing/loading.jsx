import { PageHeader } from '@smarthire/ui'
import { CardSkeleton } from '@/components/ui/Skeleton'
import PageTransition from '@/components/ui/PageTransition'

export default function BillingLoading() {
  return (
    <PageTransition>
      <div>
        <PageHeader
          title="Billing"
          lede="One credit is one hour of interview time, spent a minute at a time."
        />
        <CardSkeleton lines={2} />
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={6} />
          <CardSkeleton lines={6} />
        </div>
        <CardSkeleton className="mt-5" lines={2} />
      </div>
    </PageTransition>
  )
}
