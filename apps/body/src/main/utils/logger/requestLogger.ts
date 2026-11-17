import fs from 'fs'
import path from 'path'
import { app } from 'electron'

class ApiLogger {
  private static instance: ApiLogger | null = null
  private logDir: string
  private logFile: string
  private currentDate: string

  // 私有构造函数，防止外部直接创建实例
  private constructor() {
    // 在应用数据目录下创建日志目录
    this.logDir = path.join(app.getPath('userData'), 'apilogs')
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
    // 初始化当前日期和日志文件
    this.currentDate = this.getTodayDate()
    this.logFile = this.getLogFilePath(this.currentDate)
  }

  // 工厂方法，获取单例实例
  public static getInstance(): ApiLogger {
    if (!ApiLogger.instance) {
      ApiLogger.instance = new ApiLogger()
    }
    return ApiLogger.instance
  }

  // 获取今天的日期字符串
  private getTodayDate(): string {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // 根据日期获取日志文件路径
  private getLogFilePath(date: string): string {
    return path.join(this.logDir, `api-${date}.log`)
  }

  // 检查并更新日志文件
  private checkAndUpdateLogFile() {
    const today = this.getTodayDate()
    if (today !== this.currentDate) {
      this.currentDate = today
      this.logFile = this.getLogFilePath(today)
    }
  }

  public log(info: {
    type: 'server' | 'request'
    method: string
    url: string
    params?: any
    body?: any
    response?: any
    startTime: number
    endTime: number
    error?: any
  }) {
    // 在每次写日志前检查是否需要更新日志文件
    try {
      this.checkAndUpdateLogFile()

      const { type, method, url, params, body, response, startTime, endTime, error } = info

      const logEntry = {
        timestamp: new Date().toLocaleString(),
        type,
        method,
        url,
        params: params || {},
        body: body || {},
        response: response || {},
        duration: `${endTime - startTime}ms`,
        error: error || null
      }

      // 检查日志文件是否存在，不存在则创建
      const logFileDir = path.dirname(this.logFile)
      if (!fs.existsSync(logFileDir)) {
        fs.mkdirSync(logFileDir, { recursive: true })
      }
      if (!fs.existsSync(this.logFile)) {
        fs.writeFileSync(this.logFile, '', 'utf8')
      }

      fs.appendFileSync(this.logFile, JSON.stringify(logEntry, null, 2) + '\n=========\n', 'utf8')
    } catch (error) {
      console.error(error)
    }
  }
}

// 导出工厂方法而不是实例
export const getApiLogger = (): ApiLogger => ApiLogger.getInstance()
