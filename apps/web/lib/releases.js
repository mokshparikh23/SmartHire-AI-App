import { cache } from 'react'

/**
 * The published desktop build, read from the repo's GitHub Releases.
 *
 * RELEASE 2026-08-30. The dashboard card this feeds used to be a hardcoded
 * "Version 1.0.0" next to two href="#" buttons, and the comment that replaced
 * it named the specific failure to avoid: nothing linked that string to
 * apps/desktop/package.json, so it would have gone stale on the first release.
 *
 * So the version is never written down on this side. The release feed is the
 * single source of truth for both the number and the artifacts, which also
 * makes the card self-healing in the way its own copy promises — publish a
 * build and the pending state turns into download buttons on the next
 * revalidate, with no deploy here.
 *
 * Returns null when there is no usable release. That is a normal state, not an
 * error: it is what every environment looks like before the first publish, and
 * what a rate-limited or unreachable GitHub looks like too. Callers render the
 * pending card for it.
 */

// const REPO = 'vaishalparikh/SmartHire-AI-App'
/*
  MOVED 2026-08-30: releases are cut from mokshparikh23's copy now, because
  that is the account Vercel has GitHub access to — the old repo never appeared
  in the import list, so nothing could deploy from it.

  This repo has to stay PUBLIC. Both halves of the download path are
  unauthenticated: the releases API call below, and the browser_download_url
  the button redirects to. Making it private returns 404 here (falling back to
  the pending card) and would put a login wall in front of the binary.
*/
const REPO = 'mokshparikh23/SmartHire-AI-App'

/*
  Ten minutes. Long enough that the unauthenticated GitHub limit (60/hour per
  IP) is nowhere near reachable at 6 requests/hour, short enough that a release
  shows up while you are still watching for it. GITHUB_TOKEN is optional and
  only raises that ceiling — the endpoint is public, so it is never required.
*/
const REVALIDATE_SECONDS = 600

/*
  macOS is .dmg and nothing else, deliberately — no falling back to a zip.

  Two reasons, and the second is the sharp one. A zipped .app expands wherever
  it lands and runs un-installed from Downloads, which is the worst case for an
  unsigned build. And the v1.0.0 release still carries
  `Interview.Assistant-1.0.0-arm64-mac.zip` from March: a pre-pivot build under
  the app's old name. A zip fallback would quietly resolve to THAT and serve a
  months-old binary as the current download, which is far worse than showing
  the pending card. Matching only .dmg makes a stale release fail closed.
*/
const MATCHERS = {
  mac: [/\.dmg$/i],
  win: [/\.exe$/i],
}

export const PLATFORMS = Object.keys(MATCHERS)

function pickAsset(assets, platform) {
  for (const pattern of MATCHERS[platform]) {
    const hit = assets.find((a) => pattern.test(a.name || ''))
    if (hit) {
      return {
        name: hit.name,
        size: hit.size,
        url: hit.browser_download_url,
      }
    }
  }
  return null
}

export const getLatestRelease = cache(async () => {
  let res
  try {
    res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : null),
      },
      next: { revalidate: REVALIDATE_SECONDS },
    })
  } catch {
    // GitHub unreachable. The card falls back to pending rather than the whole
    // dashboard failing to render over a download link.
    return null
  }

  // 404 is the documented answer for "this repo has no releases", so it is not
  // worth distinguishing from any other non-200 here.
  if (!res.ok) return null

  let data
  try {
    data = await res.json()
  } catch {
    return null
  }

  if (data?.draft) return null

  const assets = Array.isArray(data?.assets) ? data.assets : []
  const mac = pickAsset(assets, 'mac')
  const win = pickAsset(assets, 'win')

  // A tagged release carrying neither artifact is not something a user can
  // download, so it is indistinguishable from no release at all.
  if (!mac && !win) return null

  return {
    // Tags are cut as v1.0.1; the UI writes its own "Version" label.
    version: String(data.tag_name || '').replace(/^v/, ''),
    publishedAt: data.published_at || null,
    notesUrl: data.html_url || null,
    mac,
    win,
  }
})

/** Bytes to the "144 MB" the download buttons show. */
export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null
  return `${Math.round(bytes / 1_000_000)} MB`
}
