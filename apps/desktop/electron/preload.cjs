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

  // ── AI answer bridge ──────────────────────────────────────────────────────
  sendAnswer:  (data)      => ipcRenderer.send('ai:answer', data),
  onAnswer:    (cb)        => {
    ipcRenderer.on('ai:answer', (_, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('ai:answer')
  },

  sendTranscript: (data)   => ipcRenderer.send('voice:transcript', data),
  onTranscript:   (cb)     => {
    ipcRenderer.on('voice:transcript', (_, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('voice:transcript')
  }
})