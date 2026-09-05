const {
  app, BrowserWindow, ipcMain, globalShortcut, screen,
  // REDESIGN 2026-08-29: desktopCapturer + shell + systemPreferences for the
  // toolbar's Screenshot button and its macOS Screen Recording permission path.
  desktopCapturer, shell, systemPreferences,
  // DOCK 2026-09-06: `dialog` for the ⌘⇧Q confirmation, `Menu` because hiding
  // the Dock icon makes this an ACCESSORY app, which has no menu bar — and with
  // no menu there is no Edit menu, so ⌘C/⌘V/⌘X/⌘A stop working in every text
  // field in the app. See installEditMenu() below.
  dialog, Menu,
} = require('electron')
const path = require('path')
const Store = require('electron-store')
const fs = require('fs')

/*
  Resolved from the app directory rather than cwd, so it works whether the app
  is launched from here or from the monorepo root.

  SPLIT 2026-09-01: `.env.local` is now loaded too, and FIRST.

  The line below read only `.env`. The working tree had a `.env.local` holding
  WEB_URL=http://127.0.0.1:3000 — written by someone following the Next.js
  naming habit from apps/dashboard next door — and dotenv never looked at it. So local
  desktop development was silently pointed at PRODUCTION: production Supabase,
  production licences, real AI spend, real session minutes deducted from a real
  account. It fails invisibly, because talking to production works.

  It also disabled a fix that was made deliberately: the CSP `connect-src`
  branch further down only adds `backendOrigin` when WEB_URL is non-https, so
  with the default https:// URL in force that branch never fired and the
  2026-08-30 "renderer could not reach a local backend" repair was inert.

  ORDER MATTERS AND IS THE OPPOSITE OF WHAT IT LOOKS LIKE. dotenv does not
  overwrite a variable that is already set, so the file loaded FIRST wins.
  `.env.local` is loaded first precisely so it overrides `.env`, which is the
  precedence every other tool in this repo uses. Both names are already in the
  root .gitignore, so neither can be committed by accident.

  // require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
*/
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const isDev = process.env.NODE_ENV === 'development'
const store = new Store()
/*
  Backend that issues and validates license keys.
  Set WEB_URL in .env to point at a locally running build of the web app.

  BACKEND MOVED 2026-08-30. This default is baked into every packaged build, so
  changing it strands every copy already installed — which is exactly what
  happened to the previous value:

    // const WEB_URL = process.env.WEB_URL || 'https://smart-hire-ai-gamma.vercel.app'

  That deployment was deleted when the project moved to an account Vercel's
  GitHub app could actually see, so shipped builds started getting
  DEPLOYMENT_NOT_FOUND from every licence check — an app that opens fine and
  then refuses a perfectly good key.

  This URL is tied to the Vercel PROJECT NAME ("web") plus the account slug.
  Renaming that project changes this host and breaks installed builds again. If
  this needs to move a third time, put a custom domain in front of it first and
  bake THAT in — a domain survives project renames, this hostname does not.
*/
const WEB_URL = process.env.WEB_URL || 'https://web-moksh-8946s-projects.vercel.app'
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'

if (isDev) console.log(`[main] license backend: ${WEB_URL}`)

let mainWindow = null

/* DOCK 2026-09-06 ─ the app is hidden from the Dock and the taskbar ───────────
   The WINDOW was already excluded from screen capture (setContentProtection, in
   createMainWindow below). What still gave the app away in a screen share was
   the app's own presence: a Dock icon on macOS, a taskbar button on Windows,
   and an entry in ⌘Tab and Mission Control.

   Hiding the Dock icon on macOS means NSApplicationActivationPolicyAccessory,
   and that takes the MENU BAR with it. Two things follow, and both are handled
   below rather than left to chance:

     - ⌘Q and the Dock icon's right-click → Quit were this app's ONLY two quit
       paths. Both are gone. confirmQuit() and ⌘⇧Q replace them.
     - No menu means no Edit menu, so ⌘C/⌘V/⌘X/⌘A stop working in every text
       field. installEditMenu() puts the roles back without showing a menu bar.

   The preference lives in electron-store, NOT in the renderer's zustand store,
   because main has to know it BEFORE any renderer exists. Read from
   localStorage it would arrive a second or two after launch, so the Dock icon
   would appear and then vanish on every start — exactly the flash this exists
   to prevent. Default is hidden. */
const DOCK_KEY = 'showInDock'
const dockVisible = () => store.get(DOCK_KEY) === true

/* Nothing destroys the window except a confirmed quit — the close button and ⌘W
   hide it instead. That is what stops a stray ⌘W leaving a running process with
   no window, no Dock icon and no menu bar: a ghost reachable only from Activity
   Monitor. `isQuitting` is how the close handler tells the two apart. */
let isQuitting = false

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
// REDESIGN 2026-08-29: the toolbar's pills carry text labels and shortcut chips
// now (Answer ⌘↵ / Screenshot ⌘⇧↵ / Chat ⌘⇧J), which needs ~650px before the
// capture toggles and End button; the taller box gives the Q/A card room.
// const PANEL = { width: 560, height: 420 }
// PREMIUM-UX 2026-08-31: 520 -> 545. The transcript bar goes from one line to
// two so a long question is readable rather than horizontally scrolled off the
// left edge, and this pays for it — the answer body still comes out marginally
// TALLER than before (~317px against ~310px), not shorter.
// const PANEL = { width: 720, height: 520 }
const PANEL = { width: 720, height: 545 }

/* PREMIUM-UX 2026-08-31 ─ focus mode ──────────────────────────────────────────
   The answer body is about 310px, which is eleven lines at 13.5px/1.75 — and two
   or three of those go to the question block above it. A 250-word answer to a
   system-design question does not fit, and the panel has never been able to
   resize: setResizable(false) while a session runs.

   Three options were weighed and two rejected. AUTO-GROW is wrong because an
   always-on-top window that changes height while you read is disorienting, can
   slide over the interviewer's video mid-sentence, and would oscillate as turns
   come and go — the one thing an overlay must not do is move on its own. A
   RESIZE GRIP is worse: a candidate forty seconds into a hard question is not
   going to find and drag a 6px corner.

   So: one deliberate, reversible, single-keystroke trade of screen space for
   reading room, made at the moment the candidate wants that trade. It grows
   DOWNWARD only — x and the top edge stay fixed, so the toolbar does not jump
   out from under the pointer — and is clamped to the display's work area. */
const FOCUS_HEIGHT = 880
const FOCUS_MARGIN = 96   // never fill the display edge to edge

// Just the toolbar bar: 52px of content plus its 1px borders. Must stay above
// PANEL_MIN.height or setBounds silently clamps the collapse back open.
const COLLAPSED_HEIGHT = 54

// Setup screens need room; the panel does not. Minimums must stay below the
// panel size, because setBounds is silently clamped by them.
// SETUP-TO-WEB 2026-08-30: 680x520 sized the three-step setup wizard, which is
// gone — setup happens on the web now and the launcher is one list plus a
// button. The name is kept because exitSessionMode() restores this size when a
// session ends, so it still means "the non-overlay window".
// const SETUP_MIN = { width: 680, height: 520 }
const SETUP_MIN = { width: 420, height: 460 }
// REDESIGN 2026-08-29: the height floor has to clear the collapsed toolbar, not
// the old 200px panel — setBounds is clamped by the minimum, so leaving it at
// 200 would make the collapse button appear to do nothing.
// const PANEL_MIN = { width: 420, height: 200 }
const PANEL_MIN = { width: 420, height: COLLAPSED_HEIGHT }

let sessionMode = false
// PREMIUM-UX 2026-08-31: whether the panel is expanded for reading. Beside
// sessionMode rather than inside the renderer, because both resize handlers have
// to agree on what "open" means — a collapse taken while focused must expand
// back to the focus height, not to the default one.
let focusMode = false
let savedBounds = null

/** The height the panel should have when it is not collapsed. */
const openHeight = () => (focusMode ? FOCUS_HEIGHT : PANEL.height)

async function createMainWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    // SETUP-TO-WEB 2026-08-30: sized for the launcher, not the retired wizard.
    // width: 780, height: 620,
    // x: Math.max(0, width - 800), y: 40,
    width: 460, height: 560,
    minWidth: SETUP_MIN.width, minHeight: SETUP_MIN.height,
    x: Math.max(0, width - 500), y: 60,

    frame: false,
    // Construction-time only in Electron — it cannot be toggled later, so the
    // window is transparent for its whole life. The launcher still looks solid
    // because .ia-launcher paints its own full-height glass background, edge to
    // edge — an inset there would leave the macOS traffic lights floating over
    // the desktop, since those are drawn on the frame and not by the page.
    transparent: true,
    backgroundColor: '#00000000',
    // macOS shadows the window RECTANGLE, not the visible panel, so leaving
    // this on hangs a grey halo around empty space during a session.
    hasShadow: false,

    // DOCK 2026-09-06: skipTaskbar now follows the Dock preference. It is the
    // Windows half of the same setting — there is no Dock there, the taskbar
    // button is the thing that shows up in a screen share.
    // alwaysOnTop: true, skipTaskbar: false,
    alwaysOnTop: true, skipTaskbar: !dockVisible(),
    /* DOCK 2026-09-06: minimizable:false is the less obvious half of the same
       problem as close-means-hide. Minimising on macOS sends the window INTO the
       Dock — and there is no Dock tile any more, so the yellow light was a
       one-way door in exactly the way the red one was. Greying it out is the
       honest rendering of "this cannot be done"; showMainWindow() still calls
       restore() for any path that minimises us some other way. */
    minimizable: false,
    resizable: true,
    /* DOCK 2026-09-06: visibleOnAllWorkspaces removed from the constructor — it
       was never doing anything. It is a BrowserWindow *property*, not a
       constructor option: electron.d.ts declares it only on `class BaseWindow`
       (:3781) and `class BrowserWindow` (:6593), never in the options
       interface, and NativeWindow::InitFromOptions does not read it. The
       explicit setVisibleOnAllWorkspaces() call further down is what has always
       been doing this work, and it is the only spelling that can pass
       skipTransformProcessType.
       roundedCorners: true, visibleOnAllWorkspaces: true, */
    roundedCorners: true,
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
      sandbox: false,

      /* BUGFIX 2026-08-30 ─ hiding the panel put the whole app to sleep ───────
         ⌘⇧H calls mainWindow.hide() (registerShortcuts, below), which makes this
         page background. Chromium then clamps setInterval toward one call a
         minute and stops firing requestAnimationFrame outright — and rAF is not
         decoration here:

           useVoice.js:206   the ENTIRE VAD loop. No tick means recorder.stop()
                             is never called, no segment is ever posted to
                             /api/ai/transcribe, and transcription stops dead.
                             Hiding the overlay — the one thing this product
                             exists to do — silently turned the microphone off.
           useInterviewSession.js:120/:308  the streamed-token flush, so hiding
                             the panel mid-answer stalled the text in bufRef.

         It also stopped the session clock in sessionStore.js:66 drifting out of
         step with the server's minutes, and lets App.jsx's ten-second licence
         poll — which doubles as the device heartbeat — keep its cadence while
         hidden, so the dashboard's device list no longer goes stale.

         The cost is real and accepted: a hidden window keeps its timers and its
         compositor awake, which is battery. That is the right trade for a tool
         whose whole purpose is to keep working while out of sight.

         It does NOT defeat macOS App Nap or system sleep. A slept machine still
         stops beating, which is why settleLiveSession()'s stale guard below and
         the bill-until clamp in session_settle() both stay. */
      backgroundThrottling: false,
    }
  })

  // setContentProtection IS the cross-platform spelling of this: NSWindow
  // sharingType on macOS, SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) on
  // Windows. The old win32 branch called a BrowserWindow method that does not
  // exist, which threw before the renderer ever loaded.
  mainWindow.setContentProtection(true)
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)
  /* DOCK 2026-09-06 ─ skipTransformProcessType is what keeps the Dock icon gone.
     Electron's own docs for this option: "Calling setVisibleOnAllWorkspaces will
     by default transform the process type between UIElementApplication and
     ForegroundApplication to ensure the correct behavior. However, this will
     hide the window and dock for a short time every time it is called."

     ForegroundApplication is the one WITH a Dock icon. Without this flag the
     line below silently undoes applyDockVisibility() a moment after it runs and
     the icon is back, with nothing in the code pointing at why.
     if (isMac) mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }) */
  if (isMac) mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: !dockVisible(),
  })

  // A renderer reload (Vite HMR, a crash) must never leave the window stuck in
  // panel geometry with the session gone.
  // BUGFIX 2026-08-30: …and must not leave the ROW open either. This handled
  // only the geometry half of exactly this case. The reloaded renderer comes
  // back with an empty store, so main is the last holder of the session id —
  // settle before restoring the window. liveSessionId is null on first load, so
  // this is a no-op there.
  // mainWindow.webContents.on('did-finish-load', () => { if (sessionMode) exitSessionMode() })
  mainWindow.webContents.on('did-finish-load', () => {
    endSession('client_stop')
    if (sessionMode) exitSessionMode()
  })

  // The same hole without the reload: a dead renderer never fires
  // did-finish-load again, so nothing else in this process would settle the row.
  mainWindow.webContents.on('render-process-gone', () => endSession('client_stop'))

  try {
    await loadRenderer(mainWindow)
  } catch (error) {
    console.error('Failed to load renderer:', error)
  }

  /* BUGFIX 2026-08-30: on darwin window-all-closed does not quit and will-quit
     never fires, so ⌘W mid-session destroyed the only renderer running the
     heartbeat and left the row open with the app still alive. The next Start
     then superseded it — "Started elsewhere", on one machine.

     'close' and not 'closed': the webContents must still exist to settle.

     DOCK 2026-09-06: ⌘W and the red traffic light now HIDE the window rather
     than destroy it. With no Dock icon a destroyed window leaves a process
     nothing can reach — and window-all-closed still does not quit on darwin —
     so the old line turned every stray ⌘W into exactly the ghost this change
     had to avoid. It also stops a stray ⌘W ending a live session, which is
     right now that hidden is a first-class state (backgroundThrottling:false
     above is what keeps a hidden session actually working).

     The settle is not lost: a real quit sets isQuitting, and will-quit calls
     endSession as well.
     mainWindow.on('close', () => endSession('client_stop')) */
  mainWindow.on('close', (e) => {
    if (isQuitting) { endSession('client_stop'); return }
    e.preventDefault()
    mainWindow.hide()
  })
  mainWindow.on('closed', () => { mainWindow = null })
}

/* DOCK 2026-09-06 ─ apply the Dock/taskbar preference to the running app ──────
   macOS has two spellings of this and they are NOT interchangeable here.
   app.dock.hide() carries a documented dead zone — "Calling dock.hide() within
   one second of a previous call will have no effect" — which the ⋮ menu toggle
   hits the moment anyone flips it twice. setActivationPolicy() has no such
   note, so it drives the change; dock.show() only tops it up on the way back,
   because a 'regular' policy on its own does not always redraw the icon at once. */
function applyDockVisibility() {
  const visible = dockVisible()

  if (process.platform === 'darwin') {
    app.setActivationPolicy(visible ? 'regular' : 'accessory')
    if (visible) app.dock?.show()
    else app.dock?.hide()
  }

  // Windows has no Dock — there the taskbar button is the same leak.
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setSkipTaskbar(!visible)
  return visible
}

/* An accessory app has no menu bar, and on macOS Electron's DEFAULT MENU is
   what makes ⌘C/⌘V/⌘X/⌘A work inside a text field — they are Edit-menu key
   equivalents, not something Chromium handles by itself. Losing them would
   break pasting a job description into setup and copying an answer out of the
   panel, which is most of what anyone does with this app. A menu still
   dispatches its key equivalents when the bar is not drawn, so this restores
   the shortcuts without putting anything back on screen. */
function installEditMenu() {
  if (process.platform !== 'darwin') return
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    /* NOT `role: 'appMenu'`. That submenu's Quit is `role: 'quit'`, which calls
       app.quit() directly and walks straight past confirmQuit() — an accidental
       ⌘Q mid-interview, with no Dock icon to relaunch from, is precisely what
       the confirmation exists to prevent. It also carries `role: 'hide'` (⌘H),
       and DockHide()'s setCanHide:NO does not protect a window that did not
       exist when the dock was hidden, so ⌘H would really hide the overlay.
       { role: 'appMenu' }, */
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        // A second way out, and it asks first like every other one.
        { label: `Quit ${app.name}`, accelerator: 'Command+Q', click: () => { confirmQuit() } },
      ],
    },
    // The reason this function exists at all: cut/copy/paste/selectAll/undo.
    { role: 'editMenu' },
    /* No fileMenu — its only mac entry is Close ⌘W. No windowMenu — ⌘M would
       minimise into a Dock that is not there. viewMenu only in dev, where ⌘R is
       how you recover from a wedged Vite HMR; ⌘R and ⌘⌥I have no business in a
       packaged build of this app. */
    ...(isDev ? [{ role: 'viewMenu' }] : []),
  ]))
}

/* DOCK 2026-09-06 ─ one way back, spelled once ────────────────────────────────
   ⌘⇧H, `activate` and `second-instance` all mean the same thing: put this window
   in front of the user. They used to be spelled three different ways, or not at
   all.

   .show() alone is NOT enough for an accessory app. With no Dock tile macOS has
   no reason to bring us forward, so the window comes back BEHIND the
   interviewer's video — which reads as "the shortcut is broken", the exact
   failure this change cannot afford. app.focus({ steal: true }) is
   [NSApp activateIgnoringOtherApps:YES] and is the only thing that raises an app
   with no tile. It is inert on Windows, where show() + focus() already raise.

   isDestroyed() and not just null: the 'closed' handler nulls mainWindow, but a
   renderer crash can leave a destroyed BrowserWindow reachable for a tick, and
   every method on it throws. */
async function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    await createMainWindow()
    applyDockVisibility()
    if (process.platform === 'darwin') app.focus({ steal: true })
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  if (process.platform === 'darwin') app.focus({ steal: true })
  mainWindow.focus()
}

/* DOCK 2026-09-06: the only thing that quits this app. ⌘⇧Q and the Quit rows in
   both ⋮ menus all route through here, so the confirmation exists in one place.
   Everything else — ⌘W, the red traffic light, ⌘⇧H — only hides. */
async function confirmQuit() {
  if (isQuitting) return

  // A sheet on a hidden window is invisible, and an accessory app does not come
  // to the front on its own. Do both before asking, or ⌘⇧Q looks like a hang.
  await showMainWindow()
  app.focus({ steal: true })

  const opts = {
    type: 'question',
    buttons: ['Cancel', 'Quit'],
    defaultId: 0,
    cancelId: 0,
    message: 'Quit Smart Hire AI?',
    detail: 'Any running session will be ended.',
  }
  const { response } = (mainWindow && !mainWindow.isDestroyed())
    ? await dialog.showMessageBox(mainWindow, opts)
    : await dialog.showMessageBox(opts)

  if (response !== 1) return

  isQuitting = true
  app.quit()
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
  // PREMIUM-UX 2026-08-31: a new session always starts unfocused, and the
  // launcher -> panel jump animates rather than snapping.
  focusMode = false
  // mainWindow.setBounds(panelBounds(savedBounds), false)
  mainWindow.setBounds(panelBounds(savedBounds), true)
  mainWindow.setResizable(false)
  // Native NSWindow buttons are painted on the frame, not by the page, so on a
  // transparent window they float as three loose dots over the user's call.
  if (process.platform === 'darwin') mainWindow.setWindowButtonVisibility(false)
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)
}

function exitSessionMode() {
  if (!mainWindow) return
  sessionMode = false
  focusMode = false   // PREMIUM-UX 2026-08-31
  if (process.platform === 'darwin') mainWindow.setWindowButtonVisibility(true)
  mainWindow.setResizable(true)
  mainWindow.setMinimumSize(SETUP_MIN.width, SETUP_MIN.height)
  // PREMIUM-UX 2026-08-31: animate back too, so ending a session is not a snap.
  // if (savedBounds) mainWindow.setBounds(clampToVisible(savedBounds), false)
  if (savedBounds) mainWindow.setBounds(clampToVisible(savedBounds), true)
  savedBounds = null
}

/* DOCK 2026-09-06 ─ the lock, and why the loser must not run will-quit ────────
   With no Dock tile and no menu bar there is no "click the running app", so
   relaunching the bundle IS the way back — and that only works if a second
   launch hands off to the first instead of opening a second copy.

   PLATFORM NOTE, because it decides which half matters where. On macOS,
   double-clicking an already-running .app does NOT start a second process:
   LaunchServices re-activates the existing one and Electron emits `activate`.
   So 'second-instance' below is what covers WINDOWS, and the `activate` repair
   further down is what covers macOS. Both call showMainWindow(); neither is
   sufficient on its own.

   THE MONEY HAZARD, AND WHY THIS SPELLING AVOIDS IT. The obvious exit for the
   loser is app.quit() — which is what Electron's own docs example uses. That
   emits will-quit, and will-quit calls endSession('client_stop'), in a SECOND
   process, while the FIRST is running a paid interview. Today it cannot post
   (liveSessionId and beatTimer are module-level and null in the loser, so
   endSession returns at its first line) but that is structural luck:
   electron-store is shared on disk, and moving liveSessionId into it — a
   plausible "survive a crash" change — would have the loser settle the WINNER's
   session. app.exit(0) is documented to skip before-quit and will-quit
   entirely, which makes the guarantee explicit rather than inherited. The loser
   has nothing to clean up: it never reaches whenReady, so it registers no
   shortcuts, opens no window and holds no session. */
const isPrimaryInstance = app.requestSingleInstanceLock()
if (!isPrimaryInstance) {
  app.exit(0)
} else {
  // Electron guarantees this fires only after `ready`, so showMainWindow can
  // assume the app is up. Function declarations are hoisted, so it is defined.
  app.on('second-instance', () => { showMainWindow() })
}

app.whenReady().then(async () => {
  /* DOCK 2026-09-06 ─ both of these run BEFORE the first window, on purpose ───
     applyDockVisibility() sets the activation policy. createMainWindow() below
     passes skipTransformProcessType: !dockVisible() to
     setVisibleOnAllWorkspaces, and that flag is only honest once the process is
     ALREADY UIElementApplication — Electron's SetVisibleOnAllWorkspaces calls
     Browser::DockHide() itself when the flag is false, so skipping it without
     having hidden the dock first would remove the one call that used to.

     It cannot go before whenReady: AppKit sets the activation policy from
     Info.plist during finishLaunching, so an earlier call gets overwritten.

     LSUIElement in electron-builder.config.cjs makes this a no-op in PACKAGED
     builds — no tile is ever drawn. In dev, `electron .` runs the stock
     Electron.app whose Info.plist has no LSUIElement, so a generic "Electron"
     icon shows for a few hundred ms and then vanishes here. Expected. */
  applyDockVisibility()
  installEditMenu()

  const { session, systemPreferences } = require('electron')
  if (process.platform === 'darwin') systemPreferences.askForMediaAccess('microphone')

  // SYSTEM-AUDIO 2026-08-30: 'display-capture' added. getDisplayMedia asks for
  // that permission and nothing else, so without it the loopback request was
  // rejected before setDisplayMediaRequestHandler below ever ran.
  // session.defaultSession.setPermissionRequestHandler((_, permission, callback) => {
  //   callback(['microphone', 'media', 'audioCapture'].includes(permission))
  // })
  session.defaultSession.setPermissionRequestHandler((_, permission, callback) => {
    callback(['microphone', 'media', 'audioCapture', 'display-capture'].includes(permission))
  })

  /* SYSTEM-AUDIO 2026-08-30 ─ capturing the other side of a call ──────────────
     The Electron 28 -> 43 upgrade (4be5aa3) was made specifically so this could
     exist, and then nothing was ever wired to it. useVoice was still on
     getUserMedia, which only ever hears the room — on headphones it hears the
     remote speaker not at all.

     Three things this handler has to get right, all established empirically in
     that upgrade because the docs are wrong or silent on each:

     - `audio: 'loopback'` is what taps system output. Electron 43's own
       electron.d.ts STILL calls it Windows-only; that comment is stale, Chromium
       made Apple's CoreAudio Tap the default back in Electron 39.
     - getDisplayMedia REJECTS a request with no video, so a video source has to
       be handed back even though we throw the track away. thumbnailSize is 1x1
       because the frame is pure ceremony.
     - useSystemPicker must stay false. On macOS 15+ true raises the native
       screen picker, which is a visible dialog at the start of every session. */
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 },
      })
      // An empty callback is how this API spells "denied". The renderer sees a
      // rejected getDisplayMedia, which useVoice reports to the panel.
      if (!sources.length) return callback({})
      callback({ video: sources[0], audio: 'loopback' })
    } catch (e) {
      console.error('[main] system audio request failed:', e.message)
      callback({})
    }
  }, { useSystemPicker: false })

  /* BUGFIX 2026-08-30 ─ the renderer could not reach a local backend ──────────
     connect-src falls back to default-src, and the old policy allowed only
     'self', data:, blob:, file: and https://*. With WEB_URL pointed at
     http://127.0.0.1:3000 for local development, every renderer fetch to the
     backend was blocked before it left the page, surfacing as the bare
     "TypeError: Failed to fetch" seen in the overlay.

     It looked like the app was half working, which made this hard to spot:
     license:validate and session:start/heartbeat/stop run in MAIN over Node
     fetch, which CSP does not apply to, so sign-in and Start Session succeeded.
     Only /api/ai/chat and /api/ai/transcribe go from the renderer, so answers,
     screenshots and chat were the only things that failed. Against the packaged
     default (an https:// Vercel URL) the policy happened to allow it, so this
     only ever bit local development.

     The fix adds the CONFIGURED origin, not a scheme wildcard. Widening this to
     http://* would let the renderer talk to any plaintext host on the machine,
     which is a real downgrade for one line of convenience — don't. */
  const backendOrigin = (() => {
    try { return new URL(WEB_URL).origin } catch { return null }
  })()

  // https://* stays so the packaged default keeps working with no env file.
  const connectSrc = ["'self'", 'data:', 'blob:', 'file:', 'https://*']
  if (backendOrigin && !backendOrigin.startsWith('https://')) connectSrc.push(backendOrigin)

  if (isDev) console.log(`[main] CSP connect-src: ${connectSrc.join(' ')}`)

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        // 'Content-Security-Policy': [
        //   "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: file: https://*"
        // ]
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: file: https://*; " +
          `connect-src ${connectSrc.join(' ')}`
        ]
      }
    })
  })

  await createMainWindow()
  /* DOCK 2026-09-06: a SECOND pass, now that the window exists. Two things only
     work with a window in hand. setSkipTaskbar is the Windows half. And
     Browser::DockHide() walks WindowList setting `[window setCanHide:NO]` —
     that list was empty when this ran at the top of whenReady, so without this
     call ⌘H would genuinely hide the overlay, and with no Dock icon ⌘⇧H would
     be the only way back. */
  applyDockVisibility()
  registerShortcuts()
  /* DOCK 2026-09-06: this only ever CREATED a window, and only when zero
     existed. A HIDDEN window still counts in getAllWindows(), so ⌘⇧H followed by
     any re-activation left this handler doing precisely nothing — the app was
     running, the window existed, and the user could reach neither.

     This is the load-bearing recovery path on macOS. Relaunching an
     already-running .app does not start a second process, so 'second-instance'
     never fires there; LaunchServices sends a reopen and Electron emits this.
     // app.on('activate', () => {
     //   if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
     // }) */
  app.on('activate', () => { showMainWindow() })
})

/* DOCK 2026-09-06: EVERY quit, not only ours. A system logout, a restart,
   app:quit and confirmQuit all reach app.quit() — and the window's 'close'
   handler would preventDefault every one of them, which is how an app becomes
   the thing that blocks a shutdown. Set once, before any window is asked to
   close. */
app.on('before-quit', () => { isQuitting = true })

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('will-quit', () => {
  /* DOCK 2026-09-06: a losing second instance exits via app.exit(0) and should
     never arrive here. This is the assertion that it stays that way — endSession
     below reads module state that is null in that process, but it also reads
     store.get('licenseKey') from a file BOTH processes share. */
  if (!isPrimaryInstance) return
  globalShortcut.unregisterAll()
  // SESSION GATE 2026-08-29: best effort only, and deliberately not awaited —
  // session/stop/route.js says not to rely on this landing, because on macOS the
  // app keeps running with no windows and a hard crash sends nothing.
  // sweep_stale_sessions() is the real backstop; this just settles a clean quit
  // immediately instead of 90 seconds later.
  // if (liveSessionId) {
  //   const licenseKey = store.get('licenseKey')
  //   if (licenseKey) {
  //     postSession('stop', { licenseKey, sessionId: liveSessionId, reason: 'app_quit' })
  //       .catch(() => {})
  //   }
  //   liveSessionId = null
  // }
  /* BUGFIX 2026-08-30: two things were wrong. 'app_quit' is not in the
     end_reason CHECK, so session_stop() was silently normalising it to
     'client_stop' — the right label by accident. And this billed to now(): a
     window closed at 09:00 and quit at 12:00 charged three hours, because
     session_stop settles to now() while only the sweep settles to
     last_heartbeat_at. settleLiveSession() applies the stale guard, and is
     idempotent, so the mainWindow 'close' handler firing first during a quit
     costs nothing here. */
  endSession('client_stop')
})

/* DOCK 2026-09-06 ─ what happens when a chord is already taken ────────────────
   register() returns false when another application owns the accelerator, and
   this function threw that answer away. Survivable while there was a Dock icon;
   not any more. ⌘⇧H is the way back to a hidden window and ⌘⇧Q is the way out,
   so a silent registration failure is how this app becomes unreachable.

   ⌘⇧Q is the one to watch: it is macOS's OWN Log Out shortcut, so it is much
   the likeliest of the three to be refused. The Quit rows in both ⋮ menus exist
   precisely so that refusal is survivable rather than terminal. */
const shortcutStatus = { toggle: false, quit: false, move: false }

function registerShortcuts() {
  // globalShortcut.register('CommandOrControl+Shift+H', () => {
  //   if (!mainWindow) return
  //   mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
  // })
  shortcutStatus.toggle = globalShortcut.register('CommandOrControl+Shift+H', () => {
    // showMainWindow and not .show(): an accessory app that shows without
    // activating comes back BEHIND the video call, and that gets reported as
    // "the shortcut is broken".
    if (!mainWindow || mainWindow.isDestroyed()) { showMainWindow(); return }
    mainWindow.isVisible() ? mainWindow.hide() : showMainWindow()
  })

  // DOCK 2026-09-06: the replacement for the ⌘Q that went with the menu bar.
  // It asks before it acts — see confirmQuit().
  shortcutStatus.quit = globalShortcut.register('CommandOrControl+Shift+Q', () => { confirmQuit() })
  /* PLACEMENT 2026-09-01 ─ REVERTED. A six-zone picker popover hung off this
     accelerator during a session (ZONES/zoneBounds here, window:moveToZone,
     components/overlay/MovePicker.jsx). It did not work well enough to keep and
     was removed at the user's request; the whole of it is in commits bfc08a3 /
     f2e8a8b / 4a8a847 if any of it is ever wanted back.

     Two things are worth knowing before anyone rebuilds it. The picker had to
     call mainWindow.focus() to receive arrow keys at all, because every panel
     shortcut is renderer-scoped — that focus steal, mid-interview, is the part
     to solve first. And it added a button to a toolbar that was ALREADY
     overflowing at PANEL.width (see the TOOLBAR-FIT note in overlay.css), so it
     made a live layout bug worse.

     Back to the blind cycle this always was. */
  // globalShortcut.register('CommandOrControl+Shift+M', () => moveToNextCorner())
  shortcutStatus.move = globalShortcut.register('CommandOrControl+Shift+M', () => moveToNextCorner())

  // DOCK 2026-09-06: ⌘⇧M is a convenience and its failure is logged only. The
  // other two are product-level conditions with no Dock icon to fall back on.
  if (!shortcutStatus.toggle) {
    console.warn('[main] Cmd+Shift+H is owned by another app — no global show/hide.')
  }
  if (!shortcutStatus.quit) {
    console.warn('[main] Cmd+Shift+Q is owned by another app (macOS Log Out?) — quit from the ⋮ menu.')
  }
}

ipcMain.handle('license:validate', async (_, licenseKey, opts) => {
  try {
    /*
      DEVICES 2026-08-30: this call is now also the device heartbeat, so the
      dashboard can list "where am I signed in" and sign a machine out remotely.

      It goes here rather than on session:start — which has carried a deviceId
      all along — because this runs on launch and every 10 seconds, whereas
      session:start only fires when an interview begins. A machine that was
      signed in but idle would otherwise never appear in the list.

      deviceId is created on first use and persisted, so it identifies the
      INSTALL, not the run. platform and version are what make the row readable
      as "macOS · Smart Hire 1.4.0" rather than a bare UUID.

      // body: JSON.stringify({ licenseKey })
    */
    const res = await fetch(`${WEB_URL}/api/license/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey,
        deviceId:   store.get('deviceId') || createDeviceId(),
        platform:   process.platform,
        appVersion: app.getVersion(),
        /*
          True only when the user submitted a key on the activation screen. The
          launch check and the ten-second loop both leave it false, which is the
          whole point: an automatic re-check must never clear a revocation, or a
          machine signed out from the dashboard would un-revoke itself on its
          next poll. Explicitly re-entering the key may.
        */
        activating: opts?.activating === true,
      })
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
  /* BUGFIX 2026-08-30: signing out mid-session orphaned the row. App.jsx's
     handleLogout unmounts MainApp, and useInterviewSession's only unmount
     cleanup bumps a generation ref — nothing stopped the session. Worse, the
     logout also stops the ten-second validate poll, which is one of only two
     things that ever runs sweep_stale_sessions(), so the row sat open until the
     next Start superseded it.

     Adding a stop to handleLogout would not have worked: it calls this FIRST,
     and session:stop authenticates with the very key deleted below. Settling
     here happens while the credential still exists, and catches every caller at
     once — SSE revocation, the ten-second poll, and the Sign out button.

     ORDER IS LOAD-BEARING. settleLiveSession() reads the key synchronously and
     postSession() closes over it as a local, so the deletes below are safe. */
  endSession('client_stop')
  store.delete('licenseKey')
  store.delete('licenseData')
  store.delete('lastValidated')
  return { success: true }
})

ipcMain.handle('app:getWebUrl',  () => WEB_URL)
ipcMain.handle('app:getVersion', () => app.getVersion())

/* DOCK 2026-09-06 ─ the Dock/taskbar toggle, and the only quit path left ──────
   The preference is main's and not the renderer's — see the DOCK note at the
   head of this file for why it cannot live in the zustand store. The renderer
   reads it once on mount and writes it on change, so there is no second copy to
   drift out of step. */
ipcMain.handle('app:getDockVisible', () => dockVisible())
ipcMain.handle('app:setDockVisible', (_, visible) => {
  store.set(DOCK_KEY, !!visible)
  return applyDockVisibility()
})
/* Deliberately the plainest thing in this file: a quit that needs the renderer
   to be healthy is not a quit. confirmQuit() asks first, and it is the same
   function ⌘⇧Q calls, so the confirmation exists in exactly one place. */
ipcMain.handle('app:quit', () => { confirmQuit(); return true })
// Lets the UI say so when ⌘⇧H or ⌘⇧Q could not be registered — with no Dock
// icon, a chord that silently did not bind is how the app becomes unreachable.
ipcMain.handle('app:shortcuts', () => ({ ...shortcutStatus }))
ipcMain.handle('overlay:enterSession', () => { enterSessionMode(); return true })
ipcMain.handle('overlay:exitSession',  () => { exitSessionMode();  return true })

/**
 * REDESIGN 2026-08-29: collapsing hides the transcript and answer bars, leaving
 * only the toolbar. The WINDOW has to shrink with them — this window is sized to
 * exactly the panel precisely so there is no dead area to swallow clicks, and
 * collapsing without resizing would leave a 450px invisible rectangle doing
 * exactly that.
 */
ipcMain.handle('overlay:setCollapsed', (_, collapsed) => {
  if (!mainWindow || !sessionMode) return false
  const bounds = mainWindow.getBounds()
  // PREMIUM-UX 2026-08-31: expanding out of a collapse must restore the height
  // the panel actually had, which is the focus height when focus mode is on.
  // const height = collapsed ? COLLAPSED_HEIGHT : PANEL.height
  const height = collapsed ? COLLAPSED_HEIGHT : openHeight()
  // Keep x/y, so collapsing does not also move the panel out from under the
  // pointer that just clicked the button.
  // PREMIUM-UX 2026-08-31: animate. macOS only — Windows ignores the flag, and
  // the in-page transitions carry the effect there.
  // mainWindow.setBounds({ ...bounds, height }, false)
  mainWindow.setBounds({ ...bounds, height }, true)
  return true
})

/**
 * PREMIUM-UX 2026-08-31: focus mode. See FOCUS_HEIGHT at the top of this file
 * for why this shape rather than auto-grow or a resize grip.
 *
 * Reuses overlay:setCollapsed's proven shape verbatim — that handler already
 * resizes a window enterSessionMode() made non-resizable, which is the one risk
 * this feature would otherwise be carrying on its own.
 */
ipcMain.handle('overlay:setFocus', (_, focus) => {
  if (!mainWindow || !sessionMode) return false
  focusMode = !!focus

  const bounds = mainWindow.getBounds()
  const area = screen.getDisplayMatching(bounds).workArea
  const height = Math.min(openHeight(), area.height - FOCUS_MARGIN)
  // Grows downward, so pull the top edge up only if the bottom would run off
  // the display. The candidate should never have to hunt for the toolbar.
  const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - height - 8))

  mainWindow.setBounds({ ...bounds, y, height }, true)
  return true
})
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

/* SESSION GATE 2026-08-29 ─────────────────────────────────────────────────────
   /api/ai/chat and /api/ai/transcribe have been behind requireSession(licenseKey,
   sessionId) since commit 4b2c816, but nothing in the app ever opened a session,
   so every AI call came back 402 no_session.

   These live in MAIN rather than the renderer for the reason lib/http.js gives:
   the session routes send no CORS headers, because they are meant to be called
   from Node. The renderer is origin "null" from file:// in a packaged build and
   would be blocked. /api/ai/* does send CORS and stays in the renderer.

   No body here carries a timestamp or a duration. All billing time comes from
   the server clock inside session_settle(); an elapsedSeconds field from the
   client is the one addition that would break that, and session/start/route.js
   says so explicitly. Do not add one. */

let liveSessionId = null

/* SESSION OWNERSHIP 2026-08-30 ─ main owns the session, because the renderer
   cannot ────────────────────────────────────────────────────────────────────

   The Sessions page showed almost every interview ending as "Started elsewhere"
   or "Connection lost" on a single machine. Both labels were accurate: the
   server only writes 'client_stop' when POST /api/session/stop arrives, and
   nothing here reliably sent it. Every row was closed later by
   sweep_stale_sessions() or by the next session_start().

   The renderer could not be the fix. sessionStore.js has no persist middleware,
   so a reload, a Vite full refresh or a crash resets isRunning and loses
   sessionId — after which the renderer is structurally incapable of closing the
   row it opened. liveSessionId survives all three, and the renderer knows
   nothing main does not: isRunning is set by the same two calls that set this.

   So the heartbeat moved here too (startBeating), and every path that ends a
   session settles through settleLiveSession().

   liveBeatAt / liveStaleMs are what stop that becoming a MONEY bug.
   session_stop() settles to now(); sweep_stale_sessions() settles to
   last_heartbeat_at. If this client has not reported inside the stale window —
   the laptop slept, the machine was suspended — a stop posted now would bill
   every wall-clock minute of the gap, and credit_debit drains the wallet rather
   than refusing. Past the window we post NOTHING and let the sweep bill the
   honest number. session_settle() now clamps this server-side as well; both
   exist because this file is unsigned JS the user can edit (asar: false), so
   the server must not depend on this guard, and the user should not depend on
   a round trip that may never happen.

   staleSeconds comes off session/start's response, so the threshold stays the
   server's to set. Nothing derived from these is ever SENT — see the note above
   about elapsedSeconds. */
let liveBeatAt  = 0
let liveStaleMs = 90 * 1000
let beatTimer   = null

async function postSession(route, body) {
  const res = await fetch(`${WEB_URL}/api/session/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

function stopBeating() {
  if (beatTimer) { clearInterval(beatTimer); beatTimer = null }
}

/**
 * The meter, on the cadence the server asked for.
 *
 * A 503 is "retry", not a verdict — the next beat tries again. Anything else
 * that is not ok means the session is over server-side, and the server has
 * already written the right end_reason, so the handle is dropped rather than
 * posting a redundant stop over the top.
 */
function startBeating(seconds) {
  stopBeating()
  beatTimer = setInterval(async () => {
    const id         = liveSessionId
    const licenseKey = store.get('licenseKey')
    if (!id || !licenseKey) return stopBeating()

    const { status, data } = await postSession('heartbeat', { licenseKey, sessionId: id })
      .catch(() => ({ status: 503, data: null }))

    if (!data) return
    if (id !== liveSessionId) return          // stopped while this beat was in flight

    if (!data.ok) {
      if (status === 503) return
      // no_session (410) means the row is gone or already closed; forbidden
      // means it was never ours. Either way there is nothing left to settle, so
      // posting a stop would be a round trip whose only outcome is 'no_session'.
      return endSession(data.code === 'no_session' ? 'expired' : 'invalid',
                        { alreadySettled: true })
    }

    liveBeatAt = Date.now()
    mainWindow?.webContents.send('session:tick', data)
    // out_of_credits / request_limit / license_revoked: already settled and
    // labelled by the server. Just let the panel know.
    if (data.stop) endSession(data.reason || 'out_of_credits', { alreadySettled: true })
  }, Math.max(5, seconds || 20) * 1000)
}

/**
 * Settles the open session, if it is still ours to settle and still worth
 * settling. Clears liveSessionId FIRST, so this is its own idempotency key: a
 * window close during a quit and the will-quit that follows it cannot both post.
 */
function settleLiveSession(reason) {
  if (!liveSessionId) return

  const licenseKey = store.get('licenseKey')
  const id      = liveSessionId
  const beatAgo = Date.now() - liveBeatAt
  liveSessionId = null

  if (!licenseKey) return
  if (beatAgo > liveStaleMs) {
    // Deliberately silent on the wire. sweep_stale_sessions() will close this at
    // last_heartbeat_at, which is the number the user actually owes.
    if (isDev) {
      console.log(`[session] leaving ${id} to the sweep: last beat ${Math.round(beatAgo / 1000)}s ago`)
    }
    return
  }
  postSession('stop', { licenseKey, sessionId: id, reason })
    .catch((e) => { if (isDev) console.error('[session] stop failed, sweep will settle:', e.message) })
}

/**
 * Ends the session locally and tells the panel.
 *
 * stopBeating() is unconditional and synchronous, and that is the whole safety
 * property: ceasing to beat IS a correct, bounded stop, because the sweep closes
 * the row within STALE_SECONDS at the honest minute count. Never keep beating to
 * hold a session open until a stop lands — that is what turns a bounded 90
 * seconds into unbounded billing, and it is why no retry loop belongs here.
 */
function endSession(reason, { alreadySettled = false } = {}) {
  // Nothing to end. Matters because did-finish-load calls this on EVERY load,
  // including the first — an unguarded notify would tell a renderer that has
  // only just mounted that a session it never had is over.
  if (!liveSessionId && !beatTimer) return

  stopBeating()
  if (alreadySettled) liveSessionId = null
  else settleLiveSession(reason)
  mainWindow?.webContents.send('session:ended', { reason })
}

/* RE-ENTRANCY 2026-08-30: nothing stopped two starts racing. Launcher.jsx's
   footer button checks `starting`, but the list row's onDoubleClick is a
   different element and consults nothing — so a quick double-click opened two
   sessions, and session_start() supersedes whatever is still open. The app was
   labelling its own rows "Started elsewhere" from one machine.

   The guard belongs here, not in the hook: main owns liveSessionId, and a
   renderer-side guard is one refactor away from being bypassed again. */
let startInFlight = null

async function doStartSession() {
  const licenseKey = store.get('licenseKey')
  if (!licenseKey) return { ok: false, code: 'no_license', reason: 'Sign in first.' }

  try {
    const { status, data } = await postSession('start', {
      licenseKey,
      deviceId:   store.get('deviceId') || createDeviceId(),
      appVersion: app.getVersion(),
    })

    if (!data?.ok) {
      return {
        ok: false,
        status,
        // 402 = out of credits, stay signed in. 403 = bad licence, sign out.
        code:   data?.code || 'unknown',
        reason: data?.reason || data?.error || 'Could not start the session',
        minutesRemaining: data?.minutesRemaining ?? 0,
      }
    }

    liveSessionId = data.sessionId
    // The stale guard needs a floor to measure from, and start() charges minute
    // one — so this IS a report. staleSeconds is already in the response; do not
    // hardcode 90 here.
    liveBeatAt    = Date.now()
    liveStaleMs   = (Number(data.staleSeconds) || 90) * 1000
    startBeating(data.heartbeatSeconds)
    return data
  } catch (e) {
    // A network failure is not a verdict on the licence — 503 means retry.
    return { ok: false, status: 503, code: 'network', reason: e.message }
  }
}

ipcMain.handle('session:start', async () => {
  if (liveSessionId) {
    return { ok: false, code: 'already_running', reason: 'A session is already running.' }
  }
  // Two clicks inside the same round trip share one request rather than opening
  // two sessions and superseding the first.
  if (startInFlight) return startInFlight

  startInFlight = doStartSession().finally(() => { startInFlight = null })
  return startInFlight
})

/* SESSION OWNERSHIP 2026-08-30: the renderer no longer drives the meter — its
   setInterval was Chromium-throttled while the overlay was hidden and died
   outright on every reload. startBeating() above does it, and the panel is told
   over session:tick / session:ended. Kept as a no-op handler rather than
   removed, because preload still exposes heartbeatSession() and an older
   renderer bundle in a half-updated dev tree would otherwise throw. */
// ipcMain.handle('session:heartbeat', async (_, sessionId) => {
//   const licenseKey = store.get('licenseKey')
//   if (!licenseKey || !sessionId) return { ok: false, code: 'no_session' }
//
//   try {
//     const { status, data } = await postSession('heartbeat', { licenseKey, sessionId })
//     // `stop: true` arrives with HTTP 200 — running out of credits is an ordinary
//     // outcome, and a 4xx here would drive the renderer down its sign-out path.
//     if (!data?.ok) {
//       return {
//         ok: false,
//         status,
//         code:   data?.code || (status === 410 ? 'no_session' : 'unknown'),
//         reason: data?.reason || data?.error || 'Session is not valid',
//       }
//     }
//     return data
//   } catch (e) {
//     return { ok: false, status: 503, code: 'network', reason: e.message }
//   }
// })
ipcMain.handle('session:heartbeat', () => ({ ok: false, code: 'owned_by_main' }))

ipcMain.handle('session:stop', async (_, sessionId, reason) => {
  const licenseKey = store.get('licenseKey')
  const id = sessionId || liveSessionId
  if (!licenseKey || !id) return { ok: false, code: 'no_session' }

  /* BUGFIX 2026-08-30: the renderer coerces this too, but main is what talks to
     the wire — a non-string here goes into JSON.stringify verbatim. The End
     button was passing a React SyntheticEvent, which is not structured-cloneable
     and threw before it ever got this far. */
  const why = typeof reason === 'string' && reason ? reason : 'client_stop'

  // Ceasing to beat is itself a bounded stop, so it happens first and
  // unconditionally — before any network call that might not return.
  stopBeating()

  // Past the stale window this posts nothing and lets the sweep bill honestly.
  // Below it, this is the same request the old body made.
  if (id === liveSessionId) {
    settleLiveSession(why)
    return { ok: true, settled: true }
  }

  try {
    // const { data } = await postSession('stop', { licenseKey, sessionId: id, reason })
    // if (id === liveSessionId) liveSessionId = null
    const { data } = await postSession('stop', { licenseKey, sessionId: id, reason: why })
    return data || { ok: false }
  } catch (e) {
    return { ok: false, status: 503, code: 'network', reason: e.message }
  }
})

/**
 * SETUP-TO-WEB 2026-08-30: the interview profiles for this licence.
 *
 * In main for the same reason as the session routes: Node fetch is subject to
 * neither CORS nor the renderer's CSP, and the licence key stays in
 * electron-store instead of being handed to the renderer. The launcher just
 * gets a list back.
 */
ipcMain.handle('profiles:list', async () => {
  const licenseKey = store.get('licenseKey')
  if (!licenseKey) return { ok: false, code: 'no_license', reason: 'Sign in first.' }

  try {
    const res = await fetch(`${WEB_URL}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey }),
    })
    const data = await res.json().catch(() => null)

    if (!data?.ok) {
      return {
        ok: false,
        status: res.status,
        code: data?.code || 'unknown',
        reason: data?.reason || data?.error || 'Could not load interviews',
      }
    }
    return data
  } catch (e) {
    // Network trouble is not a verdict on the licence — the launcher retries.
    return { ok: false, status: 503, code: 'network', reason: e.message }
  }
})

/**
 * GEMINI-FALLBACK 2026-08-30: which models the server can serve.
 *
 * The desktop cannot know this on its own — the provider is decided by which
 * API key the SERVER holds, so a hardcoded list here would be a guess that goes
 * stale the moment the backend switches provider.
 */
ipcMain.handle('ai:models', async () => {
  const licenseKey = store.get('licenseKey')
  if (!licenseKey) return { ok: false, code: 'no_license' }

  try {
    const res = await fetch(`${WEB_URL}/api/ai/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey }),
    })
    const data = await res.json().catch(() => null)
    if (!data?.ok) {
      return { ok: false, status: res.status, reason: data?.error || 'Could not load models' }
    }
    return data
  } catch (e) {
    return { ok: false, status: 503, code: 'network', reason: e.message }
  }
})

function createDeviceId() {
  const id = require('crypto').randomUUID()
  store.set('deviceId', id)
  return id
}

/* REDESIGN 2026-08-29 ─ screen capture for the toolbar's Screenshot button ────
   setContentProtection(true) above already excludes our own window from capture,
   so the overlay does not appear in its own screenshot.

   thumbnailSize bounds the image AT the capture call rather than downscaling a
   full-resolution frame afterwards, which keeps the base64 payload small enough
   to post inline. */

const SHOT_MAX = { width: 1280, height: 800 }

ipcMain.handle('capture:screenshot', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: SHOT_MAX,
    })
    if (!sources.length) return { ok: false, reason: 'No screen available to capture.' }

    // The display the panel is currently on, so a multi-monitor setup captures
    // the screen the user is actually looking at rather than always screen 0.
    const bounds = mainWindow ? mainWindow.getBounds() : { x: 0, y: 0, width: 0, height: 0 }
    const displayId = String(screen.getDisplayMatching(bounds).id)
    const source = sources.find((s) => s.display_id === displayId) || sources[0]

    if (source.thumbnail.isEmpty()) {
      // On macOS a missing TCC grant yields a blank image rather than an error.
      return { ok: false, code: 'denied', reason: 'Screen Recording permission is not granted.' }
    }

    // BUGFIX 2026-08-30: toDataURL() encodes PNG, which for a 1280x800 desktop
    // is several MB of base64 inside a JSON body — slow to post and slow for the
    // model to accept. A screenshot of an interview is a photograph of text and
    // UI, not line art, so JPEG at 70 costs nothing legible and is roughly an
    // order of magnitude smaller.
    // return { ok: true, dataUrl: source.thumbnail.toDataURL() }
    const jpeg = source.thumbnail.toJPEG(70)
    if (isDev) console.log(`[main] screenshot: ${(jpeg.length / 1024).toFixed(0)} KB jpeg`)
    return { ok: true, dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}` }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
})

/**
 * askForMediaAccess cannot request Screen Recording — it handles microphone and
 * camera only. The grant is made in System Settings, so the app can report the
 * status and open the right pane, and nothing more.
 */
ipcMain.handle('capture:permission', () => {
  if (process.platform !== 'darwin') return 'granted'
  return systemPreferences.getMediaAccessStatus('screen')
})

// REDESIGN 2026-08-29: the out-of-credits state in the answer card links to the
// web dashboard's billing page. openExternal, not a new window — the panel is
// always-on-top and a BrowserWindow for Stripe would sit over the interview.
ipcMain.handle('shell:openExternal', (_, url) => {
  // Only our own backend, so a compromised renderer cannot use this as a
  // general "open anything" primitive.
  if (typeof url !== 'string' || !url.startsWith(WEB_URL)) return false
  shell.openExternal(url)
  return true
})

ipcMain.handle('capture:openSettings', () => {
  if (process.platform !== 'darwin') return false
  shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
  )
  return true
})

// SETUP-TO-WEB 2026-08-30: no live caller any more — its only user was the
// resume step of InterviewSetup.jsx, which is unrouted now that setup happens on
// the web. Left working rather than commented out: the retired screen still
// calls it, so anything that re-routes that file keeps a functioning app.
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

/* PLACEMENT 2026-09-01: this briefly ran through a shared six-zone table so the
   picker and the cycle could not drift. The picker is gone, so the table is too,
   and this is the body it had before — verbatim, including the un-animated
   setPosition. */
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

