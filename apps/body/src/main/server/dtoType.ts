/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2024-11-29 16:41:26
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2025-07-15 01:10:53
 * @FilePath: /boss-desktop/src/main/server/dtoType.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { z } from 'zod'

// 定义 Schema
export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number()
})

export const ClickDtoSchema = z.object({
  position: PositionSchema
})

export const InputDtoSchema = ClickDtoSchema.extend({
  text: z.string()
})

export const RecommendFinishSchema = z.object({
  taskType: z.string(),
  id: z.string(),
  finishCount: z.number().optional()
})

export const StringDtoSchema = z.object({
  text: z.string()
})

export const ScrollDtoSchema = z.object({
  startPos: z.object({
    x: z.number(),
    y: z.number()
  }),
  scrollDirection: z.number(),
  offsetX: z.number(),
  offsetY: z.number()
})

// 导出类型
export type ClickDto = z.infer<typeof ClickDtoSchema>
export type InputDto = z.infer<typeof InputDtoSchema>
export type ScrollDto = z.infer<typeof ScrollDtoSchema>
export type RecommendFinishDto = z.infer<typeof RecommendFinishSchema>
// 验证中间件
export const validateDto = (schema: z.ZodSchema) => {
  return async (req: any, res: any, next: any) => {
    try {
      req.body = schema.parse(req.body)
      next()
    } catch (error) {
      console.error(error)
      res.status(400).json({
        success: false,
        error: 'Invalid request data'
      })
    }
  }
}
