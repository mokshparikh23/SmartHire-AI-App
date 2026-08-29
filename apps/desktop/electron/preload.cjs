const { contextBridge, ipcRenderer, clipboard } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Clipboard ─────────────────────────────────────────────────────────────
  copyText: (text) => clipboard.writeText(text),
  // ── License ───────────────────────────────────────────────────────────────
  validateLicense:   (key) => ipcRenderer.invoke('license:validate', key),
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

  // Kept: useVoice reports each transcript so the main process can react later.
  // The matching ai:answer/onAnswer bridge was removed — it had no ipcMain
  // relay and its only consumer was an unrouted page.
  sendTranscript: (data)   => ipcRenderer.send('voice:transcript', data)
})