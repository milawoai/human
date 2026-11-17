export const PET_SETTINGS_GROUP_KEY = 'pet_settings'

export interface PetSettings {
  openLive2DOnStart: boolean
  startServerOnStart: boolean
  selectedModelId: string
}

export const defaultPetSettings: PetSettings = {
  openLive2DOnStart: false,
  startServerOnStart: true,
  selectedModelId: 'mao_pro'
}
