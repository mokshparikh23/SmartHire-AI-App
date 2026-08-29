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

async function createMainWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize
  mainWindow = new BrowserWindow({
    width: 780, height: 620,
    minWidth: 680, minHeight: 520,
    x: Math.max(0, width - 800), y: 40,
    frame: false, transparent: false,
    alwaysOnTop: true, skipTaskbar: false,
    resizable: true, hasShadow: true,
    roundedCorners: true, visibleOnAllWorkspaces: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 10 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.platform === 'darwin') {
    mainWindow.setContentProtection(true)
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  } else if (process.platform === 'win32') {
    mainWindow.setWindowDisplayAffinity('exclude-from-capture')
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)
  }

  try {
    await loadRenderer(mainWindow)
  } catch (error) {
    console.error('Failed to load renderer:', error)
  }

  mainWindow.on('closed', () => { mainWindow = null })
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
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const [w, h] = mainWindow.getSize()
  const pad = 20
  const corners = [
    { x: width - w - pad, y: pad },
    { x: pad, y: pad },
    { x: pad, y: height - h - pad },
    { x: width - w - pad, y: height - h - pad }
  ]
  cornerIndex = (cornerIndex + 1) % corners.length
  mainWindow.setPosition(corners[cornerIndex].x, corners[cornerIndex].y)
}
