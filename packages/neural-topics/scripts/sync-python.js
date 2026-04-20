/**
 * postinstall 脚本 — 自动同步 Python 常量到 python-service
 *
 * 将 packages/neural-topics/python/neural_topics.py
 * 复制到 apps/python-service/module/common/neural_topics.py
 */
const fs = require('fs')
const path = require('path')

const SRC = path.resolve(__dirname, '..', 'python', 'neural_topics.py')
const DEST = path.resolve(__dirname, '..', '..', '..', 'apps', 'python-service', 'module', 'common', 'neural_topics.py')

if (!fs.existsSync(SRC)) {
  console.log('[neural-topics] 跳过 Python 同步：源文件不存在')
  process.exit(0)
}

// 确保目标目录存在
const destDir = path.dirname(DEST)
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true })
}

fs.copyFileSync(SRC, DEST)
console.log('[neural-topics] Python 常量已同步 → apps/python-service/module/common/neural_topics.py')
