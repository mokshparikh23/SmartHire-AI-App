/**
 * Renders build/icon.png, the one source image electron-builder derives every
 * platform icon from (.icns for macOS, .ico for Windows).
 *
 * Why a script rather than a committed binary: the mark is the web app's
 * <Logo> — an ink squircle with the `mic` glyph from components/ui/Icon.jsx.
 * Keeping it as code means the two cannot drift silently, and the paths below
 * are copied verbatim from that file so a change there is a visible diff here.
 *
 * Rendered with Electron because it is already a devDependency and is the only
 * SVG rasteriser on the machine — macOS `sips` cannot read SVG, and pulling in
 * sharp/librsvg for one 1024px PNG is not worth a native build step.
 *
 *   npm run icon --workspace apps/desktop
 *
 * Re-run it only when the mark changes; the PNG is committed so a clean clone
 * and CI can both build without Electron having to boot first.
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const SIZE = 1024

/*
  macOS Big Sur grid: the art sits in an 824px squircle centred in a 1024px
  canvas, so the surrounding transparency is part of the spec rather than
  wasted padding. Windows crops tighter, but a shared inset reads correctly on
  both and is what electron-builder's .ico downscale expects.
*/
const INSET = 100
const BOX = SIZE - INSET * 2
const RADIUS = 185

// Verbatim from apps/web/components/ui/Icon.jsx — PATHS.mic, on its 24x24 grid.
const MIC = `
  <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
  <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
  <path d="M12 18v4" />
`

// Logo renders the glyph at 55% of the mark and strokeWidth 1.75.
const GLYPH = Math.round(BOX * 0.55)
const GLYPH_OFFSET = INSET + (BOX - GLYPH) / 2

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect x="${INSET}" y="${INSET}" width="${BOX}" height="${BOX}" rx="${RADIUS}" ry="${RADIUS}" fill="#16161a" />
  <g transform="translate(${GLYPH_OFFSET} ${GLYPH_OFFSET}) scale(${GLYPH / 24})"
     fill="none" stroke="#ffffff" stroke-width="1.75"
     stroke-linecap="round" stroke-linejoin="round">
    ${MIC}
  </g>
</svg>`

const HTML = `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  svg { display: block; }
</style>
${SVG}`

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true,
    webPreferences: { offscreen: true },
  })

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`)

  /*
    capturePage resolves before the first offscreen frame is painted often
    enough to write a blank PNG, and there is no "painted" event that fires
    reliably with transparency. One frame from the paint event is the signal
    that compositing has actually run.
  */
  await new Promise((resolve) => {
    win.webContents.once('paint', () => resolve())
    win.webContents.invalidate()
    setTimeout(resolve, 3000)
  })

  const image = await win.capturePage()
  if (image.isEmpty()) {
    console.error('Capture produced an empty image; icon not written.')
    app.exit(1)
    return
  }

  const outDir = path.join(__dirname, '..', 'build')
  fs.mkdirSync(outDir, { recursive: true })
  const out = path.join(outDir, 'icon.png')
  fs.writeFileSync(out, image.toPNG())

  const { width, height } = image.getSize()
  console.log(`Wrote ${out} (${width}x${height})`)

  win.destroy()
  app.exit(0)
})
