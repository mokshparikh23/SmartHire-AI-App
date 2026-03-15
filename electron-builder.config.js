module.exports = {
  appId: 'com.interviewassistant.app',
  productName: 'Interview Assistant',
  directories: {
    output: 'release'
  },
  files: [
    'dist/**/*',
    'electron/**/*',
    'assets/**/*',
    'package.json'
  ],
  mac: {
    category: 'public.app-category.productivity',
    icon: 'assets/icons/icon.icns',
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] }
    ]
  },
  win: {
    icon: 'assets/icons/icon.ico',
    target: [
      { target: 'nsis', arch: ['x64'] }
    ]
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true
  },
  dmg: {
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' }
    ]
  }
}