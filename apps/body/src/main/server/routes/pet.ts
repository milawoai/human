import express, { Router } from 'express'
import { parseLive2DPerformancePayload } from '@shared/live2dPerformance'
import { perform } from '@main/services/live2d'

export const setupPetRoutes = (app: express.Application) => {
  const router = Router()

  router.post('/perform', async (req, res) => {
    try {
      const parsed = parseLive2DPerformancePayload(req.body)
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error })
        return
      }

      const result = await perform(parsed.payload)
      res.json({
        success: true,
        data: result
      })
    } catch (error) {
      res.status(500).json({ success: false, error: error && error['message'] })
    }
  })

  app.use('/api/pet', router)
}
