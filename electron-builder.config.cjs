module.exports = {
  appId: 'com.interviewassistant.app',
  productName: 'Interview Assistant',
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
      NSMicrophoneUsageDescription: 'Interview Assistant needs microphone access.'
    }
  },

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }]
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    shortcutName: 'Interview Assistant'
  }
}
