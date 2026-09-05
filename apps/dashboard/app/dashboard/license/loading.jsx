import { PageHeader } from '@smarthire/ui'
import { CardSkeleton } from '@/components/ui/Skeleton'
import PageTransition from '@/components/ui/PageTransition'

// The header is static, so it renders for real — only the licence cards below
// need a round trip. Nothing moves when the data lands.
export default function LicenseLoading() {
  return (
    <PageTransition>
      <div>
        <PageHeader title="License" lede="Your keys and how to activate them." />
        <CardSkeleton lines={4} />
        <CardSkeleton className="mt-5" lines={5} />
      </div>
    </PageTransition>
  )
}
