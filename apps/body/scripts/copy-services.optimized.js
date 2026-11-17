#!/usr/bin/env node
/**
 * 构建钩子脚本 - 在Electron打包前复制服务文件 (优化版)
 * 改进错误处理、进度显示和日志输出
 */

const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '../../..')
const electronAppPath = path.resolve(__dirname, '..')
const servicesDestPath = path.join(electronAppPath, 'out', 'main', 'services')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  header: (msg) => console.log(`${colors.cyan}${colors.bright}${msg}${colors.reset}`)
}

/**
 * 复制目录的优化版本
 */
function copyDirectory(source, destination, options = {}) {
  const { exclude = [], include = [], filter = null } = options

  if (!fs.existsSync(source)) {
    throw new Error(`Source directory does not exist: ${source}`)
  }

  // 创建目标目录
  fs.mkdirSync(destination, { recursive: true })

  const items = fs.readdirSync(source)

  for (const item of items) {
    const sourcePath = path.join(source, item)
    const destPath = path.join(destination, item)
    const stats = fs.statSync(sourcePath)

    // 跳过排除的目录
    if (exclude.includes(item)) {
      continue
    }

    // 检查过滤器
    if (filter && !filter(sourcePath, stats)) {
      continue
    }

    // 检查包含列表
    if (include.length > 0 && !include.includes(item)) {
      continue
    }

    try {
      if (stats.isDirectory()) {
        // 递归复制目录
        copyDirectory(sourcePath, destPath, { exclude, filter })
      } else {
        // 复制文件
        fs.copyFileSync(sourcePath, destPath)
      }
    } catch (error) {
      throw new Error(`Failed to copy ${sourcePath} to ${destPath}: ${error.message}`)
    }
  }
}

/**
 * 获取目录大小
 */
function getDirectorySize(dirPath) {
  let size = 0

  if (!fs.existsSync(dirPath)) {
    return 0
  }

  const items = fs.readdirSync(dirPath)

  for (const item of items) {
    const itemPath = path.join(dirPath, item)
    const stats = fs.statSync(itemPath)

    if (stats.isDirectory()) {
      size += getDirectorySize(itemPath)
    } else {
      size += stats.size
    }
  }

  return size
}

/**
 * 格式化字节大小
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 复制服务的主要函数
 */
async function copyServices() {
  log.header('🚀 开始复制服务文件到Electron包中...')

  try {
    // 清理目标目录
    if (fs.existsSync(servicesDestPath)) {
      fs.rmSync(servicesDestPath, { recursive: true, force: true })
    }
    fs.mkdirSync(servicesDestPath, { recursive: true })

    const results = []

    // 1. 复制后端服务
    log.info('📦 复制NestJS后端服务...')
    const backendSource = path.join(projectRoot, 'apps', 'backend', 'dist')
    const backendDest = path.join(servicesDestPath, 'backend')

    if (fs.existsSync(backendSource)) {
      const backendSize = getDirectorySize(backendSource)
      log.info(`源目录大小: ${formatBytes(backendSize)}`)

      copyDirectory(backendSource, backendDest, {
        exclude: ['.git', '.DS_Store', 'node_modules'],
        filter: (src, stats) => {
          // 过滤掉不必要的文件
          const basename = path.basename(src)
          return !basename.startsWith('.') && !basename.endsWith('.log') && basename !== 'coverage'
        }
      })

      // 复制node_modules (如果存在)
      const backendNodeModules = path.join(projectRoot, 'apps', 'backend', 'node_modules')
      const backendDestNodeModules = path.join(backendDest, 'node_modules')

      if (fs.existsSync(backendNodeModules)) {
        log.info('📚 复制后端依赖...')
        copyDirectory(backendNodeModules, backendDestNodeModules, {
          exclude: ['.cache', '.staging', '*.log'],
          filter: (src, stats) => {
            // 只复制需要的包
            const packageJsonPath = path.join(src, 'package.json')
            if (fs.existsSync(packageJsonPath)) {
              try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
                return packageJson.name && !packageJson.name.startsWith('@types')
              } catch {
                return false
              }
            }
            return stats.isDirectory()
          }
        })
      }

      results.push({ name: 'Backend', status: 'success' })
      log.success('✅ 后端服务复制完成')
    } else {
      results.push({ name: 'Backend', status: 'skipped', reason: 'dist目录不存在' })
      log.warn('⚠️  后端dist目录不存在，跳过后端复制')
    }

    // 2. 复制Python服务
    log.info('🐍 复制Python服务...')
    const pythonSource = path.join(projectRoot, 'apps', 'python-service', 'standalone')
    const pythonDest = path.join(servicesDestPath, 'python')

    if (fs.existsSync(pythonSource)) {
      const pythonSize = getDirectorySize(pythonSource)
      log.info(`源目录大小: ${formatBytes(pythonSize)}`)

      copyDirectory(pythonSource, pythonDest, {
        exclude: ['__pycache__', '.pyc', '*.log', '.DS_Store'],
        filter: (src, stats) => {
          const basename = path.basename(src)
          return (
            (!basename.endsWith('.pyc') && !basename.startsWith('.')) || basename === '.env.example'
          )
        }
      })

      results.push({ name: 'Python', status: 'success' })
      log.success('✅ Python服务复制完成')
    } else {
      results.push({ name: 'Python', status: 'skipped', reason: 'standalone目录不存在' })
      log.warn('⚠️  Python standalone目录不存在，跳过Python复制')
    }

    // 3. 生成复制报告
    generateReport(results)
  } catch (error) {
    log.error(`❌ 复制服务文件时出错: ${error.message}`)
    process.exit(1)
  }
}

/**
 * 生成复制报告
 */
function generateReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    destination: servicesDestPath,
    results: results,
    summary: {
      total: results.length,
      success: results.filter((r) => r.status === 'success').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length
    }
  }

  // 显示总结
  log.header('📊 复制总结:')
  console.log(`  目标目录: ${servicesDestPath}`)
  console.log(`  总数: ${report.summary.total}`)
  console.log(`  成功: ${colors.green}${report.summary.success}${colors.reset}`)
  console.log(`  跳过: ${colors.yellow}${report.summary.skipped}${colors.reset}`)
  console.log(`  失败: ${colors.red}${report.summary.failed}${colors.reset}`)

  // 显示详情
  results.forEach((result) => {
    const icon = result.status === 'success' ? '✅' : result.status === 'skipped' ? '⚠️' : '❌'
    console.log(`  ${icon} ${result.name}: ${result.status}`)
    if (result.reason) {
      console.log(`    原因: ${result.reason}`)
    }
  })

  // 保存报告
  const reportPath = path.join(electronAppPath, 'build', 'copy-services-report.json')
  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    log.success(`📋 复制报告已保存: ${reportPath}`)
  } catch (error) {
    log.warn(`⚠️  无法保存复制报告: ${error.message}`)
  }

  // 检查最终目录
  if (fs.existsSync(servicesDestPath)) {
    const items = fs.readdirSync(servicesDestPath)
    if (items.length > 0) {
      log.header('📋 复制的服务:')
      items.forEach((item) => {
        const itemPath = path.join(servicesDestPath, item)
        const stats = fs.statSync(itemPath)
        const icon = stats.isDirectory() ? '📁' : '📄'
        const size = stats.isFile() ? ` (${formatBytes(stats.size)})` : ''
        console.log(`  ${icon} ${item}${size}`)
      })
    } else {
      log.warn('⚠️  服务目录为空')
    }
  }

  log.header('🎉 所有服务文件复制完成!')
}

// 执行复制
copyServices().catch((error) => {
  log.error(`❌ 复制失败: ${error.message}`)
  process.exit(1)
})
