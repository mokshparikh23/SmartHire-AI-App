module.exports = {
  appId: 'com.smarthireai.app',
  productName: 'Smart Hire AI',
  asar: false,
  copyright: 'Copyright © 2025',

  directories: {
    output: 'release'
  },

  files: [
    'dist/**/*',
    'electron/**/*',
    'index.html',
    'package.json'
  ],

  mac: {
    category: 'public.app-category.productivity',
    target: [{ target: 'zip', arch: ['arm64'] }],
    hardenedRuntime: false,
    gatekeeperAssess: false,
    extendInfo: {
      NSMicrophoneUsageDescription: 'Smart Hire AI needs microphone access.'
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
