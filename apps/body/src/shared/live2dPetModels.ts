export interface Live2DPetModelConfig {
  id: string
  name: string
  resourcePath: string
  modelDirectory: string
  modelFileName: string
  scale: number
  defaultMotionGroup?: string
}

export interface Live2DPetModelsResponse {
  defaultModelId: string
  models: Live2DPetModelConfig[]
}

export const live2dPetModels: Live2DPetModelConfig[] = [
  {
    id: 'mao_pro',
    name: 'Mao Pro',
    resourcePath: '/live2d-models/mao_pro/',
    modelDirectory: 'runtime',
    modelFileName: 'mao_pro',
    scale: 1.3
  },
  {
    id: 'shizuku',
    name: 'Shizuku',
    resourcePath: '/live2d-models/shizuku/',
    modelDirectory: 'runtime',
    modelFileName: 'shizuku',
    scale: 1.5,
    defaultMotionGroup: 'Tap'
  }
]

export const defaultLive2DPetModelId = 'mao_pro'

export const getDefaultLive2DPetModel = (): Live2DPetModelConfig => {
  const model = live2dPetModels.find((item) => item.id === defaultLive2DPetModelId)

  if (!model) {
    throw new Error(`Default Live2D pet model not found: ${defaultLive2DPetModelId}`)
  }

  return model
}

export const getLive2DPetModelsResponse = (): Live2DPetModelsResponse => ({
  defaultModelId: defaultLive2DPetModelId,
  models: live2dPetModels
})
