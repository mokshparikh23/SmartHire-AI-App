module.exports = {
  appId: 'com.smarthireai.app',
  productName: 'Smart Hire AI',
  asar: false,
  // copyright: 'Copyright © 2025',
  copyright: `Copyright © ${new Date().getFullYear()} Smart Hire AI`,

  directories: {
    output: 'release',
    // Where icon.png lives. electron-builder derives the .icns and the .ico
    // from it, so there is one source image rather than three that drift.
    buildResources: 'build'
  },

  files: [
    'dist/**/*',
    'electron/**/*',
    'index.html',
    'package.json'
  ],

  /*
    RELEASE 2026-08-30: publish to the repo's GitHub Releases. This is what
    turns `--publish always` in CI into an artifact the web app can link to,
    and it is the feed electron-updater would read if auto-update is added
    later (electron/updater.js is still an empty placeholder).

    The repo is public, so release assets are downloadable without auth. That
    is fine and deliberate: the binary is not the product. It is inert without
    a licence key, which is what /api/license/validate actually gates.
  */
  publish: [
    {
      provider: 'github',
      owner: 'vaishalparikh',
      repo: 'SmartHire-AI-App'
    }
  ],

  afterPack: 'scripts/afterPack.cjs',

  mac: {
    category: 'public.app-category.productivity',
    // target: [{ target: 'zip', arch: ['arm64'] }],
    /*
      dmg only. A zip of a .app is the format that goes wrong on macOS: it
      expands wherever it lands, usually Downloads, so the app runs from there
      un-installed, and an unsigned app opened that way is the case Gatekeeper
      treats most harshly. A dmg gives the drag-to-Applications step people
      already know.

      The zip target was ALSO the electron-updater format, which is the only
      reason to keep one — but electron/updater.js is still an empty
      placeholder, so today it is 146MB of upload buying nothing. Restore this
      line at the same time as auto-update, not before:

        { target: 'zip', arch: ['arm64'] }

      arm64 only, matching the dashboard's "macOS · Apple Silicon" label — a
      universal build doubles the download to cover Intel Macs this product has
      never claimed to support.
    */
    target: [
      { target: 'dmg', arch: ['arm64'] }
    ],
    hardenedRuntime: false,
    gatekeeperAssess: false,
    /*
      Explicitly skip electron-builder's signing step. Without this it hunts
      for a Developer ID in the keychain, finds none, and emits an UNSIGNED
      arm64 bundle that macOS refuses to launch. scripts/afterPack.cjs applies
      an ad-hoc signature instead, and `null` here guarantees nothing runs
      afterwards to strip it. Swap to a real identity when a certificate exists.
    */
    identity: null,
    extendInfo: {
      NSMicrophoneUsageDescription: 'Smart Hire AI needs microphone access.',
      /*
        Added 2026-08-30. main.cjs already calls desktopCapturer and deep-links
        into the Screen Recording pane, but the bundle declared no reason
        string — so the TCC prompt appeared blank, which is the version of that
        dialog people cancel.
      */
      NSScreenCaptureUsageDescription:
        'Smart Hire AI captures the screen so it can read the question being asked.',
      NSAudioCaptureUsageDescription:
        'Smart Hire AI listens to call audio so it can transcribe the interview.'
    }
  },

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }]
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    shortcutName: 'Smart Hire AI'
  }
}
