/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2024-12-19 09:53:46
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2024-12-19 12:34:54
 * @FilePath: /boss-desktop/src/main/server/middleware/logging.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { Express, Request, Response, NextFunction } from 'express'
import { apiLogger } from '../utils/logger'

export const setupLogging = (app: Express) => {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now()
    const originalJson = res.json
    const originalSend = res.send

    // 重写 json 方法以捕获响应
    res.json = function (body: any): Response {
      const endTime = Date.now()
      apiLogger.log({
        type: 'server',
        method: req.method,
        url: req.originalUrl,
        params: req.query,
        body: req.body,
        response: body,
        startTime,
        endTime
      })

      return originalJson.call(this, body)
    }

    // 重写 send 方法以捕获响应
    res.send = function (body: any): Response {
      const endTime = Date.now()

      apiLogger.log({
        type: 'server',
        method: req.method,
        url: req.originalUrl,
        params: req.query,
        body: req.body,
        response: body,
        startTime,
        endTime
      })

      return originalSend.call(this, body)
    }

    next()
  })
}
