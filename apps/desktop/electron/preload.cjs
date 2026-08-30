const { contextBridge, ipcRenderer, clipboard } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Clipboard ─────────────────────────────────────────────────────────────
  copyText: (text) => clipboard.writeText(text),
  // ── License ───────────────────────────────────────────────────────────────
  // DEVICES 2026-08-30: `opts.activating` marks the call as the user submitting
  // a key on the activation screen, as opposed to the launch check or the
  // ten-second re-validation loop. Only that call may clear a device revocation
  // — see the note in main.cjs.
  // validateLicense: (key) => ipcRenderer.invoke('license:validate', key),
  validateLicense:   (key, opts) => ipcRenderer.invoke('license:validate', key, opts),
  getLicense:        ()    => ipcRenderer.invoke('license:get'),
  clearLicense:      ()    => ipcRenderer.invoke('license:clear'),
  getWebUrl:         ()    => ipcRenderer.invoke('app:getWebUrl'),

  // ── Window ────────────────────────────────────────────────────────────────
  toggleOverlay:     ()    => ipcRenderer.invoke('window:toggle'),
  hideWindow:        ()    => ipcRenderer.invoke('window:hide'),
  setWindowOpacity:  (o)   => ipcRenderer.invoke('window:setOpacity', o),
  setOverlayOpacity: (o)   => ipcRenderer.invoke('overlay:setOpacity', o),

  // ── App ───────────────────────────────────────────────────────────────────
  getVersion: ()           => ipcRenderer.invoke('app:getVersion'),
  platform:   process.platform,

  // ── PDF Parsing ───────────────────────────────────────────────────────────
  parsePdf: (filePath)     => ipcRenderer.invoke('parse-pdf', filePath),

  // ── Session mode ──────────────────────────────────────────────────────────
  // Shrinks the window to exactly the floating panel and back. Replaces
  // startListening/stopListening, which were called but never exposed here.
  enterSessionMode: ()     => ipcRenderer.invoke('overlay:enterSession'),
  exitSessionMode:  ()     => ipcRenderer.invoke('overlay:exitSession'),
  // REDESIGN 2026-08-29: the window shrinks with the collapsed panel, so the
  // hidden bars leave no invisible rectangle intercepting clicks.
  setOverlayCollapsed: (v) => ipcRenderer.invoke('overlay:setCollapsed', v),

  // Kept: useVoice reports each transcript so the main process can react later.
  // The matching ai:answer/onAnswer bridge was removed — it had no ipcMain
  // relay and its only consumer was an unrouted page.
  sendTranscript: (data)   => ipcRenderer.send('voice:transcript', data),

  // ── Metered session ───────────────────────────────────────────────────────
  // SESSION GATE 2026-08-29: /api/ai/* is gated on a sessionId that nothing was
  // opening. These run in main because the session routes send no CORS headers
  // and this renderer is origin "null" from file:// once packaged.
  startSession:     ()                => ipcRenderer.invoke('session:start'),
  heartbeatSession: (id)              => ipcRenderer.invoke('session:heartbeat', id),
  // SESSION OWNERSHIP 2026-08-30: `reason` is coerced to a string on both sides
  // now. It used to be whatever the caller passed, and Toolbar's onClick={onEnd}
  // passed a React SyntheticEvent — which is not structured-cloneable, so this
  // call threw and no interview ever reported that it had ended.
  stopSession:      (id, reason)      => ipcRenderer.invoke('session:stop', id, reason),

  /* SESSION OWNERSHIP 2026-08-30: main drives the meter now, so these are how
     the panel hears about it. The renderer's own setInterval was throttled to a
     crawl whenever ⌘⇧H hid the window and died completely on every reload,
     which meant a server-side stop — out of credits, request limit, licence
     revoked — could only reach the UI through the one timer that had already
     failed.

     Each returns its own unsubscribe, so an effect cleanup removes exactly the
     listener it added rather than every listener on the channel. The wrapper
     also strips IpcRendererEvent, which has no business crossing into React. */
  onSessionTick: (fn) => {
    const h = (_e, data) => fn(data)
    ipcRenderer.on('session:tick', h)
    return () => ipcRenderer.removeListener('session:tick', h)
  },
  onSessionEnded: (fn) => {
    const h = (_e, data) => fn(data)
    ipcRenderer.on('session:ended', h)
    return () => ipcRenderer.removeListener('session:ended', h)
  },

  // ── Interview profiles ────────────────────────────────────────────────────
  // SETUP-TO-WEB 2026-08-30: setup now lives on the web; the launcher only
  // lists and picks. Runs in main so the licence key never enters the renderer.
  listProfiles: ()         => ipcRenderer.invoke('profiles:list'),

  // GEMINI-FALLBACK 2026-08-30: the model list comes from the server, since the
  // provider depends on which API key the server holds.
  listModels: ()           => ipcRenderer.invoke('ai:models'),

  // ── Screen capture ────────────────────────────────────────────────────────
  // REDESIGN 2026-08-29: backs the toolbar's Screenshot button.
  captureScreen:       ()  => ipcRenderer.invoke('capture:screenshot'),
  getScreenPermission: ()  => ipcRenderer.invoke('capture:permission'),
  openScreenSettings:  ()  => ipcRenderer.invoke('capture:openSettings'),

  // Restricted to WEB_URL in main — not a general "open anything" primitive.
  openExternal: (url)      => ipcRenderer.invoke('shell:openExternal', url)
})