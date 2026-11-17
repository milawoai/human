/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2024-08-26 09:25:17
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2025-12-22 17:38:31
 * @FilePath: /electron-app_jv_cut/src/main/utils/file.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { shell } from 'electron'
import fs from 'fs'
import path from 'path'

export const openFile = async (filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, message: '路径不存在' }
    }
    if (fs.statSync(filePath).isFile()) {
      await shell.showItemInFolder(filePath)
      return { success: true, message: '文件夹已打开并选择文件' }
    }
    const respose = await shell.openPath(filePath)
    return { success: true, data: respose }
  } catch (error) {
    return { success: false }
  }
}

export const copyRecursiveSync = (src, dest) => {
  const entries = fs.readdirSync(src, { withFileTypes: true })

  entries.forEach((entry) => {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true })
      copyRecursiveSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  })
}

/**
 * 生成绝对路径
 *
 * @param originPath 原始路径（可能是相对路径或绝对路径）
 * @param folderPath 基准文件夹路径（可选，用于解析相对路径）
 * @returns 绝对路径字符串
 *
 * @example
 * ```typescript
 * // originPath 已经是绝对路径
 * genAbsolutePath('/absolute/path/to/file') // 返回 '/absolute/path/to/file'
 *
 * // 使用 folderPath 作为基准
 * genAbsolutePath('relative/path', '/base/folder') // 返回 '/base/folder/relative/path'
 *
 * // folderPath 不存在，使用当前工作目录
 * genAbsolutePath('relative/path') // 返回 path.resolve('relative/path')
 * ```
 */
export function genAbsolutePath(originPath: string, folderPath?: string): string {
  // 处理无效输入
  if (!originPath || typeof originPath !== 'string') {
    throw new Error('originPath 必须是有效的字符串')
  }

  // 如果 originPath 已经是绝对路径，直接返回
  if (path.isAbsolute(originPath)) {
    return path.normalize(originPath)
  }

  // 如果提供了 folderPath
  if (folderPath) {
    // 验证 folderPath 是否为有效字符串
    if (typeof folderPath !== 'string') {
      throw new Error('folderPath 必须是有效的字符串')
    }

    // 如果 folderPath 是绝对路径，直接使用
    // 如果是相对路径，先解析为绝对路径
    const basePath = path.isAbsolute(folderPath)
      ? path.normalize(folderPath)
      : path.resolve(folderPath)

    // 将 originPath 相对于 basePath 解析为绝对路径
    return path.resolve(basePath, originPath)
  }

  // 如果 folderPath 不存在，使用当前工作目录作为基准
  return path.resolve(originPath)
}

/**
 * 生成相对路径
 *
 * @param originPath 原始文件路径（被引用的文件）
 * @param importToPath 目标文件路径（引用方的文件）
 * @returns 相对路径字符串（适用于 import 语句）
 *
 * @example
 * ```typescript
 * // 从 /src/components/Button.ts 引用 /src/utils/helper.ts
 * genRelativePath('/src/utils/helper.ts', '/src/components/Button.ts')
 * // 返回 '../utils/helper'
 *
 * // 同目录下的文件
 * genRelativePath('/src/utils/format.ts', '/src/utils/helper.ts')
 * // 返回 './format'
 * ```
 */
export function genRelativePath(originPath: string, importToPath: string): string {
  // 处理无效输入
  if (!originPath || typeof originPath !== 'string') {
    throw new Error('originPath 必须是有效的字符串')
  }
  if (!importToPath || typeof importToPath !== 'string') {
    throw new Error('importToPath 必须是有效的字符串')
  }

  // 获取 importToPath 所在的目录（因为 import 是相对于文件所在目录）
  const importDir = path.dirname(importToPath)

  // 计算 originPath 相对于 importDir 的路径
  let relativePath = path.relative(importDir, originPath)

  // 统一使用正斜杠（兼容 Windows）
  relativePath = relativePath.split(path.sep).join('/')

  // 如果不是以 . 或 .. 开头，添加 ./
  if (!relativePath.startsWith('.') && !relativePath.startsWith('/')) {
    relativePath = './' + relativePath
  }

  // 移除文件扩展名（适用于 import 场景）
  const ext = path.extname(relativePath)
  if (ext) {
    relativePath = relativePath.slice(0, -ext.length)
  }

  return relativePath
}
