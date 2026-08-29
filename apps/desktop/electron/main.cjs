const { app, BrowserWindow, ipcMain, globalShortcut, screen } = require('electron')
const path = require('path')
const Store = require('electron-store')
const fs = require('fs')

// Resolved from the app directory rather than cwd, so it works whether the app
// is launched from here or from the monorepo root.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const isDev = process.env.NODE_ENV === 'development'
const store = new Store()
// Backend that issues and validates license keys.
// Set WEB_URL in .env to point at a locally running build of the web app.
const WEB_URL = process.env.WEB_URL || 'https://smart-hire-ai-gamma.vercel.app'
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'

if (isDev) console.log(`[main] license backend: ${WEB_URL}`)

let mainWindow = null

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function loadRenderer(window) {
  if (!isDev) {
    await window.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
    return
  }

  let lastError = null
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      await window.loadURL(DEV_SERVER_URL)
      return
    } catch (error) {
      lastError = error
      await delay(500)
    }
  }

  throw lastError
}

// Size of the floating panel shown while a session runs. The window is set to
// exactly these bounds so there is no window area outside the panel — clicks
// beside it land on whatever app is behind, with nothing to intercept them.
const PANEL = { width: 560, height: 420 }

// Setup screens need room; the panel does not. Minimums must stay below the
// panel size, because setBounds is silently clamped by them.
const SETUP_MIN = { width: 680, height: 520 }
const PANEL_MIN = { width: 420, height: 200 }

let sessionMode = false
let savedBounds = null

async function createMainWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 780, height: 620,
    minWidth: SETUP_MIN.width, minHeight: SETUP_MIN.height,
    x: Math.max(0, width - 800), y: 40,

    frame: false,
    // Construction-time only in Electron — it cannot be toggled later, so the
    // window is transparent for its whole life. The setup screens still look
    // solid because each one paints its own full-height background.
    transparent: true,
    backgroundColor: '#00000000',
    // macOS shadows the window RECTANGLE, not the visible panel, so leaving
    // this on hangs a grey halo around empty space during a session.
    hasShadow: false,

    alwaysOnTop: true, skipTaskbar: false,
    resizable: true,
    roundedCorners: true, visibleOnAllWorkspaces: true,
    // Without this, the first click back onto the app after clicking through to
    // another window is eaten just to re-activate us.
    acceptFirstMouse: true,

    ...(isMac ? {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 10 },
    } : {}),

    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // setContentProtection IS the cross-platform spelling of this: NSWindow
  // sharingType on macOS, SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) on
  // Windows. The old win32 branch called a BrowserWindow method that does not
  // exist, which threw before the renderer ever loaded.
  mainWindow.setContentProtection(true)
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)
  if (isMac) mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // A renderer reload (Vite HMR, a crash) must never leave the window stuck in
  // panel geometry with the session gone.
  mainWindow.webContents.on('did-finish-load', () => { if (sessionMode) exitSessionMode() })

  try {
    await loadRenderer(mainWindow)
  } catch (error) {
    console.error('Failed to load renderer:', error)
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

/** Panel home: horizontally centred, high enough to clear the speaker's face. */
function panelBounds(reference) {
  const area = screen.getDisplayMatching(reference).workArea
  return {
    width:  PANEL.width,
    height: PANEL.height,
    x: Math.round(area.x + (area.width - PANEL.width) / 2),
    y: Math.round(area.y + area.height * 0.12),
  }
}

/** Guards against restoring onto a display that has since been unplugged. */
function clampToVisible(bounds) {
  const area = screen.getDisplayMatching(bounds).workArea
  const onScreen =
    bounds.x < area.x + area.width && bounds.x + bounds.width > area.x &&
    bounds.y < area.y + area.height && bounds.y + bounds.height > area.y
  if (onScreen) return bounds

  const primary = screen.getPrimaryDisplay().workArea
  return {
    ...bounds,
    x: Math.round(primary.x + (primary.width - bounds.width) / 2),
    y: primary.y + 40,
  }
}

function enterSessionMode() {
  if (!mainWindow || sessionMode) return
  sessionMode = true
  savedBounds = mainWindow.getBounds()

  // Lower the minimums FIRST — setBounds is clamped by them, so without this
  // the panel would render at the setup window's 680x520.
  mainWindow.setMinimumSize(PANEL_MIN.width, PANEL_MIN.height)
  mainWindow.setBounds(panelBounds(savedBounds), false)
  mainWindow.setResizable(false)
  // Native NSWindow buttons are painted on the frame, not by the page, so on a
  // transparent window they float as three loose dots over the user's call.
  if (process.platform === 'darwin') mainWindow.setWindowButtonVisibility(false)
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)
}

function exitSessionMode() {
  if (!mainWindow) return
  sessionMode = false
  if (process.platform === 'darwin') mainWindow.setWindowButtonVisibility(true)
  mainWindow.setResizable(true)
  mainWindow.setMinimumSize(SETUP_MIN.width, SETUP_MIN.height)
  if (savedBounds) mainWindow.setBounds(clampToVisible(savedBounds), false)
  savedBounds = null
}

app.whenReady().then(async () => {
  const { session, systemPreferences } = require('electron')
  if (process.platform === 'darwin') systemPreferences.askForMediaAccess('microphone')

  session.defaultSession.setPermissionRequestHandler((_, permission, callback) => {
    callback(['microphone', 'media', 'audioCapture'].includes(permission))
  })

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: file: https://*"
        ]
      }
    })
  })

  await createMainWindow()
  registerShortcuts()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('will-quit', () => { globalShortcut.unregisterAll() })

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (!mainWindow) return
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
  })
  globalShortcut.register('CommandOrControl+Shift+M', () => moveToNextCorner())
}

ipcMain.handle('license:validate', async (_, licenseKey) => {
  try {
    const res = await fetch(`${WEB_URL}/api/license/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey })
    })
    const data = await res.json()
    if (data.valid) {
      store.set('licenseKey', licenseKey)
      store.set('licenseData', data)
      store.set('lastValidated', Date.now())
    }
    return data
  } catch (e) {
    return { valid: false, reason: 'Could not connect to server.' }
  }
})

ipcMain.handle('license:get', () => ({
  key: store.get('licenseKey'),
  data: store.get('licenseData'),
  lastValidated: store.get('lastValidated')
}))

ipcMain.handle('license:clear', () => {
  store.delete('licenseKey')
  store.delete('licenseData')
  store.delete('lastValidated')
  return { success: true }
})

ipcMain.handle('app:getWebUrl',  () => WEB_URL)
ipcMain.handle('app:getVersion', () => app.getVersion())
ipcMain.handle('overlay:enterSession', () => { enterSessionMode(); return true })
ipcMain.handle('overlay:exitSession',  () => { exitSessionMode();  return true })
ipcMain.handle('window:hide',    () => { if (mainWindow) mainWindow.hide() })
ipcMain.handle('window:toggle',  () => {
  if (!mainWindow) return
  mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
})
ipcMain.handle('window:setOpacity',  (_, o) => { if (mainWindow) mainWindow.setOpacity(o) })
ipcMain.handle('overlay:setOpacity', (_, o) => { if (mainWindow) mainWindow.setOpacity(o) })
ipcMain.handle('clipboard:copy', (_, text) => {
  require('electron').clipboard.writeText(text)
})

ipcMain.handle('parse-pdf', async (_, filePath) => {
  try {
    const { extractText } = await import('unpdf')
    const buffer = fs.readFileSync(filePath)
    const uint8 = new Uint8Array(buffer)
    const { text } = await extractText(uint8, { mergePages: true })
    const cleaned = text
      .replace(/\r\n|\r/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (!cleaned || cleaned.length < 50)
      return { success: false, error: 'No text found.' }
    return { success: true, text: cleaned }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

let cornerIndex = 0
function moveToNextCorner() {
  if (!mainWindow) return
  const bounds = mainWindow.getBounds()
  // getDisplayMatching, not getPrimaryDisplay: the old version assumed the
  // origin was (0,0), so on a second monitor this teleported the window to the
  // primary one. Work-area offsets also account for the dock and menu bar.
  const area = screen.getDisplayMatching(bounds).workArea
  const { width: w, height: h } = bounds
  const pad = 20

  const spots = [
    // Home first, so the cycle can always return the panel to centre.
    { x: area.x + Math.round((area.width - w) / 2), y: area.y + Math.round(area.height * 0.12) },
    { x: area.x + area.width - w - pad, y: area.y + pad },
    { x: area.x + pad,                  y: area.y + pad },
    { x: area.x + pad,                  y: area.y + area.height - h - pad },
    { x: area.x + area.width - w - pad, y: area.y + area.height - h - pad },
  ]
  cornerIndex = (cornerIndex + 1) % spots.length
  mainWindow.setPosition(spots[cornerIndex].x, spots[cornerIndex].y)
}
