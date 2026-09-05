import { PageHeader } from '@smarthire/ui'
import { CardSkeleton } from '@/components/ui/Skeleton'
import PageTransition from '@/components/ui/PageTransition'

export default function SettingsLoading() {
  return (
    <PageTransition>
      <div className="max-w-2xl">
        <PageHeader title="Settings" lede="Your account details." />
        {/*
          DELETE-ACCOUNT 2026-09-01: four cards, not two.

          The page has had four since the Devices card shipped and this stood at
          two, so every load of /dashboard/settings grew by two cards' height at
          the swap — the exact failure the note at the top of Skeleton.jsx calls
          worse than no skeleton at all. This feature makes the fourth card
          taller again, which is what finally made it visible.

          Line counts are per-card rather than a uniform 3, for the same reason:
          Profile is two labelled fields and a button, Account is a two-row list,
          Devices is a lede plus a list plus a footnote, and Delete account is two
          paragraphs, a rule and a control.

          <CardSkeleton lines={3} />
          <CardSkeleton className="mt-5" lines={3} />
        */}
        <CardSkeleton lines={5} />
        <CardSkeleton className="mt-5" lines={2} />
        <CardSkeleton className="mt-5" lines={6} />
        <CardSkeleton className="mt-5" lines={5} />
      </div>
    </PageTransition>
  )
}
