export interface TabConfig {
  tabKey: string
  tabLabel: string
  groups: ConfigGroup[]
}

export interface RenderParams {
  placeholder?: string
  defaultValue?: any
  options?: Array<{ label: string; value: any }>
}

export interface ConfigItem {
  renderType:
    | 'input'
    | 'textarea'
    | 'selector'
    | 'switch'
    | 'filePath'
    | 'folderPath'
    | 'systemVarInput'
  renderLabel: string
  renderParams: RenderParams
  key: string
  value: any
}

export interface ConfigGroup {
  saveType: 'remote' | 'cache' | 'localEnv' | 'systemVar'
  params: Record<string, any>
  groupKey: string
  groupLabel: string
  getHandle?: () => Promise<any>
  setHandle?: (value: any) => Promise<void>
  list: ConfigItem[]
}
