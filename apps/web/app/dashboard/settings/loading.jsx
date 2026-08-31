import { PageHeader } from 'smarthire-ui'
import { CardSkeleton } from '@/components/ui/Skeleton'
import PageTransition from '@/components/ui/PageTransition'

export default function SettingsLoading() {
  return (
    <PageTransition>
      <div className="max-w-2xl">
        <PageHeader title="Settings" lede="Your account details." />
        <CardSkeleton lines={3} />
        <CardSkeleton className="mt-5" lines={3} />
      </div>
    </PageTransition>
  )
}
