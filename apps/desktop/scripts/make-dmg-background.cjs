/**
 * Renders build/dmg-background.png (and @2x), the artwork behind the install
 * window when someone opens the dmg.
 *
 * This exists because the builds are unsigned. macOS blocks the first launch
 * with a dialog whose most prominent button — the blue, default one — is "Move
 * to Trash", and whose only other option, "Done", just closes it. There is no
 * "Open Anyway" in that dialog; it lives in System Settings, and it only appears
 * AFTER a blocked attempt. A user who has not been told this reasonably
 * concludes the download is broken and deletes it.
 *
 * The dmg window is the one surface every installer sees, before any of that
 * happens, so the instructions belong here rather than only on the website.
 *
 * Two failure modes this is aimed at, both observed:
 *   1. Running the app straight out of the mounted dmg instead of installing it.
 *      Read-only media is the harshest case for Gatekeeper and quarantine
 *      cannot be cleared there, so it fails in a way that looks unfixable.
 *   2. Clicking the blue button and deleting a 152MB download.
 *
 * Regenerate with:  npm run dmg-bg --workspace apps/desktop
 *
 * Keep it in step with electron-builder.config.cjs `dmg.window` and
 * `dmg.contents` — the icon coordinates there sit on top of this image, and the
 * arrow is drawn to land between them.
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

// Matches dmg.window in electron-builder.config.cjs.
const W = 600
// Tall enough that the third step clears the warning rule at the bottom. At 460
// they overlapped, which put the "do not click Move to Trash" line — the one
// sentence that saves the download — on top of the step above it.
const H = 520

// Matches dmg.contents. The arrow is drawn between these two.
const ICON_Y = 190
const APP_X = 150
const APPLICATIONS_X = 450

/*
  The web app's tokens, so the installer does not look like a different product
  than the dashboard the user just came from. globals.css: --color-canvas,
  --color-ink, --color-muted, --color-line.
*/
const HTML = `<!doctype html>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; }
  body {
    background: #faf9f7;
    font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
    position: relative;
  }

  .title {
    position: absolute; top: 42px; left: 0; right: 0;
    text-align: center;
    font-size: 17px; font-weight: 600; letter-spacing: -0.01em;
    color: #16161a;
  }
  .sub {
    position: absolute; top: 68px; left: 0; right: 0;
    text-align: center;
    font-size: 12px; color: #71717a;
  }

  /* Sits between the two icons electron-builder draws over this image. */
  .arrow {
    position: absolute;
    top: ${ICON_Y - 10}px;
    left: ${APP_X + 62}px;
    width: ${APPLICATIONS_X - APP_X - 124}px;
    height: 20px;
  }

  .steps {
    position: absolute; left: 56px; right: 56px; top: 272px;
  }
  .step {
    display: flex; align-items: flex-start; gap: 10px;
    margin-bottom: 11px;
  }
  .n {
    flex: 0 0 18px; height: 18px; border-radius: 9px;
    background: #16161a; color: #ffffff;
    font-size: 10px; font-weight: 600;
    display: flex; align-items: center; justify-content: center;
    margin-top: 1px;
  }
  .t { font-size: 12px; line-height: 1.45; color: #3f3f46; }
  .t b { font-weight: 600; color: #16161a; }

  .warn {
    position: absolute; left: 56px; right: 56px; bottom: 26px;
    padding-top: 12px; border-top: 1px solid #e7e5e4;
    font-size: 11px; line-height: 1.45; color: #a16207;
  }
</style>

<div class="title">Install Smart Hire AI</div>
<div class="sub">Drag the app into Applications — do not run it from here</div>

<svg class="arrow" viewBox="0 0 100 20" preserveAspectRatio="none">
  <path d="M2 10 H88" stroke="#a1a1aa" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M80 4 L92 10 L80 16" stroke="#a1a1aa" stroke-width="1.5" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>

<div class="steps">
  <div class="step">
    <div class="n">1</div>
    <div class="t">Drag <b>Smart Hire AI</b> onto the <b>Applications</b> folder above.</div>
  </div>
  <div class="step">
    <div class="n">2</div>
    <div class="t">Open it from Applications. macOS blocks it once — expected.</div>
  </div>
  <div class="step">
    <div class="n">3</div>
    <div class="t">Click <b>Done</b>, then <b>System Settings &rsaquo; Privacy &amp;
      Security</b> &rarr; <b>Open Anyway</b>, at the bottom.</div>
  </div>
</div>

<div class="warn">
  In that dialog, do not click &ldquo;Move to Trash&rdquo; — it is the blue
  default button, and it deletes the app.
</div>`

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W,
    height: H,
    show: false,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true },
  })

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`)

  // Same reason as make-icon.cjs: capturePage can resolve before the first
  // offscreen frame is composited, which writes a blank image.
  await new Promise((resolve) => {
    win.webContents.once('paint', () => resolve())
    win.webContents.invalidate()
    setTimeout(resolve, 3000)
  })

  const shot = await win.capturePage()
  if (shot.isEmpty()) {
    console.error('Capture produced an empty image; background not written.')
    app.exit(1)
    return
  }

  const outDir = path.join(__dirname, '..', 'build')
  fs.mkdirSync(outDir, { recursive: true })

  /*
    Finder picks background@2x.png on a Retina display and background.png
    elsewhere, so both are written from the one capture. Resizing explicitly
    rather than trusting the display scale keeps the output identical whatever
    machine regenerates it.
  */
  const at2x = shot.getSize().width === W * 2
    ? shot
    : shot.resize({ width: W * 2, height: H * 2, quality: 'best' })
  const at1x = shot.resize({ width: W, height: H, quality: 'best' })

  /*
    These names are electron-builder's convention, not a preference: it looks
    for background.png / background@2x.png inside directories.buildResources on
    its own. An explicit `dmg.background` path was tried first and silently did
    not resolve — the build succeeded and shipped electron-builder's stock
    540x380 artwork, with no warning that the configured file had been ignored.
    Relying on the convention removes the setting that can fail quietly.
  */
  fs.writeFileSync(path.join(outDir, 'background.png'), at1x.toPNG())
  fs.writeFileSync(path.join(outDir, 'background@2x.png'), at2x.toPNG())

  console.log(`Wrote ${outDir}/background.png (${W}x${H}) and @2x`)

  win.destroy()
  app.exit(0)
})
