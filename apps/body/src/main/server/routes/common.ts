/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2024-12-20 17:03:15
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2026-01-22 16:51:17
 * @FilePath: /boss-desktop/src/main/server/routes/common.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { WindowManager } from '@main/windowManager'
import express, { Router } from 'express'

export const setupCommonRoutes = (app: express.Application) => {
  const router = Router()

  router.post('/hello', async (_req, res) => {
    try {
      res.json({ success: true, msg: 'Hello' })
    } catch (error) {
      res.status(500).json({ success: false, error: error && error['message'] })
    }
  })

  router.post('/report', async (req, res) => {
    try {
      try {
        const mainWindow = WindowManager.getMainWindow()
        // 发送配置更新事件
        mainWindow?.webContents.send('recevied-report-message', req)
      } catch (error) {
        console.error(error)
      }
      res.json({ success: true, msg: '' })
    } catch (error) {
      res.status(500).json({ success: false, error: error && error['message'] })
    }
  })

  app.use('/common', router)
}
