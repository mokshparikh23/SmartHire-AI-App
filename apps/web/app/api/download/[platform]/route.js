import { NextResponse } from 'next/server'
import { getLatestRelease, PLATFORMS } from '@/lib/releases'

/**
 * Redirects to the current desktop build for a platform.
 *
 * RELEASE 2026-08-30. The point of the indirection is that /api/download/mac
 * never changes, while the artifact behind it carries a version in its
 * filename and moves every release. Linking the GitHub asset URL straight from
 * the dashboard would mean every published build needs a matching web deploy,
 * which is the coupling the old hardcoded "Version 1.0.0" string already
 * demonstrated the cost of.
 *
 * Deliberately NOT behind a session check. The repo is public, so the same
 * bytes are one click away on the releases page — a gate here would buy no
 * protection and would break the marketing site linking to it. What actually
 * gates the product is /api/license/validate: the app is inert without a key.
 *
 * Gating on entitlement would also be actively wrong today. Licences are only
 * issued by an admin from /admin/licenses — the Stripe webhook grants minutes
 * and never calls createLicense — so most paying customers have no licence row
 * yet and would be refused their own download.
 */

// The redirect target changes when a release is published, and the upstream
// fetch carries its own revalidate. Nothing here may be baked in at build time.
export const dynamic = 'force-dynamic'

export async function GET(request, ctx) {
  const { platform } = await ctx.params

  if (!PLATFORMS.includes(platform)) {
    return NextResponse.json(
      { error: `Unknown platform "${platform}". Expected one of: ${PLATFORMS.join(', ')}.` },
      { status: 404 },
    )
  }

  const release = await getLatestRelease()
  const asset = release?.[platform]

  if (!asset) {
    /*
      503 rather than 404: the route is real and the build is expected, there
      just isn't one published for this platform yet. Windows in particular
      lags macOS whenever a release is cut from a developer machine, since NSIS
      packaging needs the Windows runner.
    */
    return NextResponse.json(
      { error: `No published build for ${platform} yet.`, retry: true },
      { status: 503 },
    )
  }

  return NextResponse.redirect(asset.url, 302)
}
