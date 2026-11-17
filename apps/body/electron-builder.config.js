/**
 * electron-builder 配置文件
 * 用于配置 Electron 应用的打包和分发
 */

module.exports = {
  // 应用配置
  appId: 'com.example.autocoding',
  productName: 'AutoCoding',
  copyright: 'Copyright © 2025 ${author}',

  // 构建目录
  directories: {
    output: 'release',
    buildResources: 'build'
  },

  // 额外资源文件
  // 这里配置的服务文件会被复制到打包后的应用目录中
  // 而不是被打包到应用的可执行文件内
  extraResources: [
    {
      from: 'out/main/services',
      to: 'services',
      filter: ['**/*']
    }
  ],

  // macOS 配置
  mac: {
    category: 'public.app-category.developer-tools',
    icon: 'build/icon.icns',
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64']
      },
      {
        target: 'zip',
        arch: ['x64', 'arm64']
      }
    ]
  },

  // Windows 配置
  win: {
    icon: 'build/icon.ico',
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      },
      {
        target: 'zip',
        arch: ['x64']
      }
    ]
  },

  // Linux 配置
  linux: {
    icon: 'build/icon.png',
    target: [
      {
        target: 'AppImage',
        arch: ['x64']
      },
      {
        target: 'deb',
        arch: ['x64']
      }
    ]
  },

  // NSIS 配置（Windows）
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true
  },

  // DMG 配置（macOS）
  dmg: {
    title: '${productName} ${version}',
    contents: [
      {
        x: 410,
        y: 150,
        type: 'file'
      },
      {
        x: 130,
        y: 150,
        type: 'link',
        path: '/Applications'
      }
    ]
  },

  // 文件关联
  fileAssociations: [
    {
      ext: 'acp',
      name: 'AutoCoding Project',
      description: 'AutoCoding 项目文件',
      role: 'Editor',
      icon: 'build/icon.icns'
    }
  ],

  // 打包配置
  compression: 'maximum',
  removePackageScripts: true,

  // 发布配置（可选）
  // publish: {
  //   provider: 'github',
  //   owner: 'your-username',
  //   repo: 'your-repo'
  // },

  // 签名配置（生产环境需要）
  // mac: {
  //   identity: 'Developer ID Application: Your Name (TEAM_ID)'
  // },
  // win: {
  //   certificateFile: 'path/to/certificate.p12',
  //   certificatePassword: 'password'
  // }
}
