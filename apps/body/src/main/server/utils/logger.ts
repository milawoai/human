/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-01-16 14:52:41
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2025-02-27 16:04:30
 * @FilePath: /boss-desktop/src/main/server/utils/logger.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

class ApiLogger {
  private logDir: string
  private logFile: string
  private currentDate: string

  constructor() {
    // 在应用数据目录下创建日志目录
    this.logDir = path.join(app.getPath('userData'), 'apilogs')
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
    // 初始化当前日期和日志文件
    this.currentDate = this.getTodayDate()
    this.logFile = this.getLogFilePath(this.currentDate)
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

export const apiLogger = new ApiLogger()
