#!/usr/bin/env node
/**
 * 构建钩子脚本 - 在Electron打包前复制服务文件
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const projectRoot = path.resolve(__dirname, '../../..')
const electronAppPath = path.resolve(__dirname, '..')
const servicesDestPath = path.join(electronAppPath, 'out', 'main', 'services')

console.log('🚀 开始复制服务文件到Electron包中...')

try {
  // 清理目标目录
  if (fs.existsSync(servicesDestPath)) {
    fs.rmSync(servicesDestPath, { recursive: true, force: true })
  }
  fs.mkdirSync(servicesDestPath, { recursive: true })

  // 1. 复制后端服务 (构建后的dist目录)
  console.log('📦 复制NestJS后端服务...')
  const backendSourcePath = path.join(projectRoot, 'apps', 'backend', 'dist')
  const backendDestPath = path.join(servicesDestPath, 'backend')

  if (fs.existsSync(backendSourcePath)) {
    fs.cpSync(backendSourcePath, backendDestPath, { recursive: true })
    console.log('✅ 后端服务复制完成')

    // 复制node_modules (生产依赖)
    const backendNodeModules = path.join(projectRoot, 'apps', 'backend', 'node_modules')
    const backendDestNodeModules = path.join(backendDestPath, 'node_modules')
    if (fs.existsSync(backendNodeModules)) {
      fs.cpSync(backendNodeModules, backendDestNodeModules, { recursive: true })
      console.log('✅ 后端依赖复制完成')
    }
  } else {
    console.warn('⚠️  后端dist目录不存在，跳过后端复制')
  }

  // 2. 复制Python服务 (优先使用 uv 打包版本)
  console.log('🐍 复制Python服务...')
  const pythonUvStandalonePath = path.join(projectRoot, 'apps', 'python-service', 'standalone-uv')
  const pythonPyinstallerStandalonePath = path.join(projectRoot, 'apps', 'python-service', 'standalone')
  const pythonSourcePath = path.join(projectRoot, 'apps', 'python-service')
  const pythonDestPath = path.join(servicesDestPath, 'python')

  // 优先顺序：uv standalone > pyinstaller standalone > 源代码
  if (fs.existsSync(pythonUvStandalonePath)) {
    // 如果存在 uv standalone 版本，复制它（最高优先级）
    fs.cpSync(pythonUvStandalonePath, pythonDestPath, { recursive: true })
    console.log('✅ Python服务 (uv standalone) 复制完成')
  } else if (fs.existsSync(pythonPyinstallerStandalonePath)) {
    // 如果存在 pyinstaller standalone 版本，复制它
    fs.cpSync(pythonPyinstallerStandalonePath, pythonDestPath, { recursive: true })
    console.log('✅ Python服务 (pyinstaller standalone) 复制完成')
  } else if (fs.existsSync(pythonSourcePath)) {
    // 如果没有独立版本，复制源代码 + uv 环境
    console.log('⚠️  Python standalone目录不存在，复制源代码 + uv 环境')

    // 排除不必要的目录
    const excludeDirs = ['node_modules', '__pycache__', '.git', '.spec-workflow', 'dist']

    // 如果存在 .uv 环境，也复制它（但排除 node_modules）
    const uvVenvPath = path.join(pythonSourcePath, '.venv')
    const pythonWithVenvDest = path.join(pythonDestPath, 'with-venv')
    const pythonWithoutVenvDest = path.join(pythonDestPath, 'source')

    // 创建目录
    fs.mkdirSync(pythonWithVenvDest, { recursive: true })
    fs.mkdirSync(pythonWithoutVenvDest, { recursive: true })

    // 复制带虚拟环境的版本（如果存在）
    if (fs.existsSync(uvVenvPath)) {
      console.log('📦 复制 uv 虚拟环境...')
      // 只复制虚拟环境的 Python 解释器和 site-packages
      const venvIncludePath = path.join(uvVenvPath, 'lib', 'python*', 'site-packages')
      const venvIncludeExists = fs.existsSync(venvIncludePath)

      if (venvIncludeExists) {
        const venvDest = path.join(pythonWithVenvDest, '.venv')
        fs.cpSync(uvVenvPath, venvDest, { recursive: true, filter: (src) => {
          // 只复制必要的目录
          const basename = path.basename(src)
          return !['bin', 'include'].includes(basename)
        }})
        console.log('✅ uv 虚拟环境复制完成')
      }
    }

    // 复制源代码（排除特定目录）
    fs.cpSync(pythonSourcePath, pythonWithoutVenvDest, {
      recursive: true,
      filter: (src) => {
        const basename = path.basename(src)
        const relativePath = path.relative(pythonSourcePath, src)

        // 排除条件
        if (excludeDirs.some(dir => relativePath.startsWith(dir))) {
          return false
        }

        // 排除 .venv 目录（单独处理）
        if (basename === '.venv') {
          return false
        }

        return true
      }
    })

    // 复制主要文件到根目录
    const mainFiles = ['main.py', 'pyproject.toml', '.env', 'requirements.txt']
    mainFiles.forEach(file => {
      const srcFile = path.join(pythonSourcePath, file)
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, path.join(pythonDestPath, file))
      }
    })

    console.log('✅ Python服务 (源代码 + uv 环境) 复制完成')
  } else {
    console.warn('⚠️  Python服务目录不存在，跳过Python复制')
  }

  console.log('🎉 所有服务文件复制完成!')
  console.log(`📍 服务文件位置: ${servicesDestPath}`)

  // 显示复制结果
  if (fs.existsSync(servicesDestPath)) {
    const items = fs.readdirSync(servicesDestPath)
    console.log('📋 复制的服务:')
    items.forEach((item) => {
      const itemPath = path.join(servicesDestPath, item)
      const stats = fs.statSync(itemPath)
      if (stats.isDirectory()) {
        console.log(`  📁 ${item}/`)
      } else {
        console.log(`  📄 ${item}`)
      }
    })
  }
} catch (error) {
  console.error('❌ 复制服务文件时出错:', error)
  process.exit(1)
}
