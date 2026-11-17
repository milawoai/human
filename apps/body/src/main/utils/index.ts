/*
 * 通用工具函数
 */

import { spawn } from 'child_process'

/**
 * 生成User-Agent字符串
 * @returns 随机的User-Agent字符串
 */
export function generateUserAgent(): string {
  const userAgents = [
    // Chrome on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    // Chrome on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    // Firefox on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0',
    // Safari on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15'
  ]

  return userAgents[Math.floor(Math.random() * userAgents.length)]
}

/**
 * 延迟执行函数
 * @param ms 延迟时间（毫秒）
 * @returns Promise对象
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 执行子进程命令
 *
 * 通用的子进程执行工具，用于运行命令行工具并获取输出
 *
 * @param command 命令名称（如 'whisper', 'ffmpeg'）
 * @param args 命令参数数组
 * @returns Promise，包含执行结果 { success, stdout, stderr }
 *
 * @example
 * ```typescript
 * const result = await spawnProcess('whisper', ['--help'])
 * if (result.success) {
 *   console.log('输出:', result.stdout)
 * } else {
 *   console.error('错误:', result.stderr)
 * }
 * ```
 */
export async function spawnProcess(
  command: string,
  args: string[]
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('error', (error) => {
      resolve({ success: false, stdout, stderr: error.message })
    })

    child.on('close', (code) => {
      resolve({ success: code === 0, stdout, stderr })
    })
  })
}

// 导出其他工具函数...
/**
 * 格式化实体名称 (转换为 PascalCase)
 */
export function tableToPascal(tableName: string): string {
  // 移除表前缀 (如果有)
  let name = tableName.replace(/^(t_|tbl_|table_)/i, '')

  // 转换为 PascalCase
  name = name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('')

  return name
}

/**
 * 将 PascalCase 转换为 kebab-case
 * 例如: WorkflowToolNodes -> workflow-tool-nodes
 */
export function pascalToKebab(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2') // 在小写字母/数字和大写字母之间插入连字符
    .toLowerCase()
}

export function lowerFirst(s: string) {
  if (!s) return s
  return s.charAt(0).toLowerCase() + s.slice(1)
}

export function upperFirst(s: string) {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)))
}
