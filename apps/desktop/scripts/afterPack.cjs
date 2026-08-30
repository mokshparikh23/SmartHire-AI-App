/**
 * Ad-hoc signs the packaged macOS app.
 *
 * This is not optional cosmetics. Apple Silicon refuses to execute an arm64
 * Mach-O that carries no signature at all — the app dies at launch with
 * "damaged and can't be opened", which reads to a user as a corrupt download.
 * Electron's own prebuilt binary ships ad-hoc signed, but electron-builder
 * rewrites Info.plist and copies resources into the bundle, which invalidates
 * that signature. Something has to re-apply one.
 *
 * `mac.identity: null` in electron-builder.config.cjs turns off the builder's
 * own signing step, so nothing runs after this hook to undo the signature.
 *
 * An ad-hoc signature is NOT Gatekeeper approval. A downloaded build still
 * carries the com.apple.quarantine attribute and still needs the first-launch
 * override the dashboard documents. It only buys "runs at all once unquarantined",
 * which is the floor for shipping anything to an M-series Mac. Replace this with
 * a real Developer ID identity plus notarization when the certificate exists —
 * at that point delete the hook and set `identity`/`notarize` instead.
 *
 * --deep is deprecated by Apple for Developer ID signing, where each nested
 * component needs its own entitlements. For an ad-hoc pass with no entitlements
 * it is the correct tool: one traversal, inside-out, no per-component config.
 */
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = `${context.packager.appInfo.productFilename}.app`
  const appPath = path.join(context.appOutDir, appName)

  console.log(`  • ad-hoc signing ${appName}`)

  try {
    execFileSync(
      'codesign',
      ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath],
      { stdio: 'inherit' },
    )
  } catch (e) {
    /*
      Fail the build rather than emit an app that cannot launch. A silently
      unsigned arm64 build is worse than no build: it uploads fine, downloads
      fine, and only fails on the user's machine.
    */
    throw new Error(`Ad-hoc codesign failed for ${appPath}: ${e.message}`)
  }

  // Prove the signature took, for the same reason — the failure is otherwise
  // invisible until someone downloads it.
  execFileSync('codesign', ['--verify', '--strict', appPath], { stdio: 'inherit' })
  console.log('  • ad-hoc signature verified')
}
