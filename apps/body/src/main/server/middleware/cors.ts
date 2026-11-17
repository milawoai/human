/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2024-12-19 10:15:07
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2024-12-19 10:16:07
 * @FilePath: /boss-desktop/src/main/server/middleware/cors.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import express from 'express'

export const setupCors = (app: express.Application) => {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type')
    // 处理 OPTIONS 预检请求
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200)
    }
    return next()
  })
}
