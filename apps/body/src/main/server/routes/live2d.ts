import express, { Router } from 'express'
import {
  getCurrentModelInfo,
  getPetModels,
  openWindow,
  playMotion,
  setExpression
} from '@main/services/live2d'

export const setupLive2DRoutes = (app: express.Application) => {
  const router = Router()

  router.get('/pet-models', async (_req, res) => {
    try {
      res.json({
        success: true,
        data: getPetModels()
      })
    } catch (error) {
      res.status(500).json({ success: false, error: error && error['message'] })
    }
  })

  router.post('/window/open', async (_req, res) => {
    try {
      res.json({
        success: true,
        data: await openWindow()
      })
    } catch (error) {
      res.status(500).json({ success: false, error: error && error['message'] })
    }
  })

  router.get('/current', async (_req, res) => {
    try {
      res.json({
        success: true,
        data: await getCurrentModelInfo()
      })
    } catch (error) {
      res.status(500).json({ success: false, error: error && error['message'] })
    }
  })

  router.post('/motion', async (req, res) => {
    try {
      const { group, index } = req.body || {}
      if (typeof group !== 'string' || typeof index !== 'number') {
        res.status(400).json({ success: false, error: 'group 必须是 string，index 必须是 number' })
        return
      }

      res.json({
        success: true,
        data: await playMotion(group, index)
      })
    } catch (error) {
      res.status(500).json({ success: false, error: error && error['message'] })
    }
  })

  router.post('/expression', async (req, res) => {
    try {
      const { name } = req.body || {}
      if (typeof name !== 'string') {
        res.status(400).json({ success: false, error: 'name 必须是 string' })
        return
      }

      res.json({
        success: true,
        data: await setExpression(name)
      })
    } catch (error) {
      res.status(500).json({ success: false, error: error && error['message'] })
    }
  })

  app.use('/live2d', router)
}
