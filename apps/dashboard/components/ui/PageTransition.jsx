import { ViewTransition } from 'react'

/**
 * Crossfade + a small rise, applied to a route's content.
 *
 * No 'use client' and no dependency: Next 16 aliases `react` to its own vendored
 * build in all four layers, and that build exports ViewTransition from the
 * react-server entry too, so this works in a Server Component. (Top-level
 * react@19.2.8 does NOT export it — anything that resolves the real `react`,
 * such as a test runner outside Next, will not see this component.)
 *
 * Two rules worth not rediscovering:
 *
 * 1. This belongs in each page.jsx, NEVER in a layout. Layouts persist across
 *    navigation, so a wrapper there would never fire enter or exit.
 * 2. `default="none"` is mandatory. Without it every <ViewTransition> on the
 *    page animates on every unrelated transition, including ones it has nothing
 *    to do with.
 *
 * The same wrapper goes around each loading.jsx root, so the skeleton uses the
 * identical enter/exit pair and "skeleton → content" reads as the same gesture
 * as "page → page".
 */
export default function PageTransition({ children }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  )
}
