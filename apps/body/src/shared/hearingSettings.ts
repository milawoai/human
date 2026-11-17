export const HEARING_SETTINGS_GROUP_KEY = 'hearing_settings'

export interface HearingSettings {
  selectedAsrModelId: string
  saveDir: string
}

export const defaultHearingSettings: HearingSettings = {
  selectedAsrModelId: 'funasr-nano',
  saveDir: ''
}
