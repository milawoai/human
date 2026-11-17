import { openFile } from '@main/utils/file'
import { app, dialog } from 'electron'
import fs from 'fs'
import path from 'path'

export const readFileAsArrayBuffer = async (filePath: string) => {
  if (!filePath) {
    return { success: false, msg: '文件路径为空' }
  }

  if (!fs.existsSync(filePath)) {
    return { success: false, msg: '文件不存在' }
  }

  const stat = fs.statSync(filePath)
  if (!stat.isFile()) {
    return { success: false, msg: '路径不是文件' }
  }

  // Guardrail: avoid freezing renderer with extremely large payloads.
  const maxBytes = 80 * 1024 * 1024
  if (stat.size > maxBytes) {
    return { success: false, msg: `文件过大(${stat.size} bytes)` }
  }

  const buffer = fs.readFileSync(filePath)
  // Return Buffer directly. Electron will structured-clone it to Uint8Array in renderer.
  return { success: true, data: buffer }
}

export const openFolder = async (filePath) => {
  return openFile(filePath)
}

export const selectFolder = async (params) => {
  const { defaultPath = '' } = params || {}
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath: defaultPath
  })
  const { canceled = true, filePaths = [] } = result || {}
  if (canceled) {
    return { success: false }
  } else {
    return { success: true, data: filePaths[0] }
  }
}

export const selectFile = async (params) => {
  const { prefixs = [] } = params || {}
  const filters = prefixs.length > 0 ? [{ name: 'Files', extensions: prefixs }] : []
  const userDataPath = app.getPath('userData')
  const configFolderPath = path.join(userDataPath, 'zhou_jy_config')
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: filters,
    defaultPath: configFolderPath
  })

  const { canceled = true, filePaths = [] } = result || {}
  if (canceled) {
    return { success: false }
  } else {
    return { success: true, data: filePaths[0] }
  }
}

export const saveFile = async (content, defaultPath) => {
  try {
    const { filePath } = await dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: 'All Files', extensions: ['*'] }]
    })

    if (filePath) {
      await fs.writeFileSync(filePath, content)
    }
  } catch (error) {
    console.error('保存文件失败:', error)
  }
}

export const openFiles = async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'All Files', extensions: ['*'] }]
    })

    if (filePaths && filePaths.length > 0) {
      const content = await fs.readFileSync(filePaths[0], 'utf-8')
      return content
    }
    return ''
  } catch (error) {
    console.error('打开文件失败:', error)
    return ''
  }
}

export const imageToBase64 = async (imagePath: string) => {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(imagePath)) {
      return { success: false, msg: '图片文件不存在' }
    }

    // 读取图片文件
    const imageBuffer = fs.readFileSync(imagePath)

    // 获取文件扩展名，确定 MIME 类型
    const ext = path.extname(imagePath).toLowerCase()
    let mimeType = 'image/png' // 默认类型

    switch (ext) {
      case '.jpg':
      case '.jpeg':
        mimeType = 'image/jpeg'
        break
      case '.png':
        mimeType = 'image/png'
        break
      case '.gif':
        mimeType = 'image/gif'
        break
      case '.bmp':
        mimeType = 'image/bmp'
        break
      case '.webp':
        mimeType = 'image/webp'
        break
      case '.svg':
        mimeType = 'image/svg+xml'
        break
    }

    // 转换为 base64
    const base64 = imageBuffer.toString('base64')
    const dataUrl = `data:${mimeType};base64,${base64}`

    return { success: true, data: dataUrl }
  } catch (error) {
    console.error('图片转换失败:', error)
    return {
      success: false,
      msg: `图片转换失败: ${error instanceof Error ? error.message : '未知错误'}`
    }
  }
}

// 创建文件夹 folderPath: 文件路径, isRewriter: 复写
export const createFolder = async (folderPath, isRewriter) => {
  try {
    // 检查文件夹是否已存在
    if (fs.existsSync(folderPath)) {
      if (isRewriter) {
        // 如果允许覆写,先删除原文件夹
        fs.rmSync(folderPath, { recursive: true, force: true })
      } else {
        return { success: false, msg: '文件夹已存在' }
      }
    }

    // 创建文件夹 (recursive: true 会创建所有必需的父目录)
    fs.mkdirSync(folderPath, { recursive: true })

    return { success: true, msg: '文件夹创建成功' }
  } catch (error) {
    console.error('创建文件夹失败:', error)
    return {
      success: false,
      msg: `创建文件夹失败: ${error instanceof Error ? error.message : '未知错误'}`
    }
  }
}

// 创建文件夹 文件路径
export const createFolderInProject = async (projectPath, relativePath, isRewriter) => {
  try {
    // 拼接完整路径
    const fullPath = path.join(projectPath, relativePath)

    // 调用 createFolder 复用逻辑
    return await createFolder(fullPath, isRewriter)
  } catch (error) {
    console.error('在项目中创建文件夹失败:', error)
    return {
      success: false,
      msg: `在项目中创建文件夹失败: ${error instanceof Error ? error.message : '未知错误'}`
    }
  }
}

// 创建文件：content 文本，文件路径
export const createFile = async (content, filePath, isRewriter) => {
  try {
    // 检查文件是否已存在
    if (fs.existsSync(filePath)) {
      if (!isRewriter) {
        return { success: false, msg: '文件已存在' }
      }
    }

    // 确保父目录存在
    const dirPath = path.dirname(filePath)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }

    // 写入文件
    fs.writeFileSync(filePath, content, 'utf-8')

    return { success: true, msg: '文件创建成功' }
  } catch (error) {
    console.error('创建文件失败:', error)
    return {
      success: false,
      msg: `创建文件失败: ${error instanceof Error ? error.message : '未知错误'}`
    }
  }
}

// 创建文件：content 文本，文件路径
export const createFileInProject = async (content, projectPath, relativePath, isRewriter) => {
  try {
    // 拼接完整路径
    const fullPath = path.join(projectPath, relativePath)

    // 调用 createFile 复用逻辑
    return await createFile(content, fullPath, isRewriter)
  } catch (error) {
    console.error('在项目中创建文件失败:', error)
    return {
      success: false,
      msg: `在项目中创建文件失败: ${error instanceof Error ? error.message : '未知错误'}`
    }
  }
}

// 在终端中打开路径
export const openInTerminal = async (folderPath: string) => {
  try {
    if (!folderPath || !fs.existsSync(folderPath)) {
      return { success: false, message: '路径不存在' }
    }

    const { exec } = await import('child_process')
    const platform = process.platform

    let command: string

    if (platform === 'darwin') {
      // macOS: 使用 Terminal.app 打开并切换到指定目录
      command = `open -a Terminal "${folderPath}"`
    } else if (platform === 'win32') {
      // Windows: 使用 cmd 打开
      command = `start cmd /K "cd /d ${folderPath}"`
    } else {
      // Linux: 尝试使用常见的终端
      command = `x-terminal-emulator -e "cd ${folderPath} && bash"`
    }

    return new Promise((resolve, reject) => {
      exec(command, (error) => {
        if (error) {
          reject({ success: false, message: `打开终端失败: ${error.message}` })
        } else {
          resolve({ success: true, message: '已在终端中打开' })
        }
      })
    })
  } catch (error: any) {
    return { success: false, message: error.message || '打开终端失败' }
  }
}
