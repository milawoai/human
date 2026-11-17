import DefaultStoreHandler from '@main/store'
import {
  defaultPetSettings,
  PET_SETTINGS_GROUP_KEY,
  type PetSettings
} from '@shared/petSettings'
import {
  defaultHearingSettings,
  HEARING_SETTINGS_GROUP_KEY,
  type HearingSettings
} from '@shared/hearingSettings'
import type { ConfigGroup, TabConfig } from '@shared/types/config'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

// 配置数据
const configParams: TabConfig[] = [
  {
    tabKey: 'common',
    tabLabel: '通用',
    groups: [
      {
        saveType: 'cache',
        params: {},
        groupKey: 'api_request_settings',
        groupLabel: 'API 请求设置',
        list: [
          {
            renderType: 'switch',
            renderLabel: 'API 请求从主进程发出',
            renderParams: { placeholder: '' },
            key: 'api_request_from_main',
            value: true
          }
        ]
      },
      {
        saveType: 'cache',
        params: {},
        groupKey: 'config_folders',
        groupLabel: '配置文件/文件夹路径',
        list: [
          {
            renderType: 'folderPath',
            renderLabel: 'nest后端路径',
            renderParams: { placeholder: '' },
            key: 'nest_folder_path',
            value: ''
          },
          {
            renderType: 'input',
            renderLabel: 'nest 端口',
            renderParams: { placeholder: '' },
            key: 'nest_port',
            value: ''
          }
        ]
      },
      {
        saveType: 'cache',
        params: {},
        groupKey: 'config_folders',
        groupLabel: '配置文件/文件夹路径',
        list: [
          {
            renderType: 'folderPath',
            renderLabel: '截图缓存路径',
            renderParams: { placeholder: '' },
            key: 'screen_shot_path',
            value: ''
          }
        ]
      },
    ]
  },
  {
    tabKey: 'system',
    tabLabel: '系统变量',
    groups: [
      {
        saveType: 'systemVar',
        params: {},
        groupKey: 'system_variables',
        groupLabel: '自定义系统环境变量',
        list: [
          {
            renderType: 'systemVarInput',
            renderLabel: '系统变量管理',
            renderParams: {},
            key: 'systemVars',
            value: {}
          }
        ]
      }
    ]
  }
]

// 初始化时加载配置
export const initialConfigs = async () => {
  try {
    // 加载环境变量
    await loadEnvFile()
    // 更新配置值
    for (const tab of configParams) {
      for (const group of tab.groups) {
        if (group.saveType === 'localEnv') {
          for (const item of group.list) {
            item.value = process.env[item.key] || ''
          }
        } else if (group.saveType === 'cache') {
          // 从 Store 中加载缓存的值
          const cachedValues = DefaultStoreHandler.get<Record<string, any>>(group.groupKey)
          if (cachedValues) {
            for (const item of group.list) {
              item.value = cachedValues[item.key] || ''
            }
          }
        } else if (group.saveType === 'systemVar') {
          // 系统变量不需要在这里加载，由 SystemVarInput 组件自己处理
        }
      }
    }
  } catch (error) {
    console.error('初始化配置失败:', error)
  }
}

// 获取所有配置
export const getAllConfigs = async () => {
  return configParams
}

// 保存配置
export const saveConfig = async (groupKey: string, values: Record<string, any>) => {
  try {
    // 根据不同的 saveType 进行不同的保存操作
    const group = findGroupByKey(groupKey)
    if (!group) {
      throw new Error(`找不到配置组：${groupKey}`)
    }

    switch (group.saveType) {
      case 'localEnv':
        // 保存到本地环境变量
        await saveToEnvFile(values)
        // 立即更新进程的环境变量
        Object.entries(values).forEach(([key, value]) => {
          process.env[key] = String(value)
        })
        break
      case 'cache':
        // 保存到 Store
        DefaultStoreHandler.set(groupKey, values)
        break
      case 'systemVar':
        // 系统变量由 SystemVarInput 组件自己处理，这里不需要额外操作
        break
      case 'remote':
        // 保存到远程
        await saveToRemote(groupKey, values)
        break
    }

    // 更新内存中的配置值
    updateConfigValues(groupKey, values)

    return { success: true }
  } catch (error) {
    console.error('保存配置失败:', error)
    return { success: false, message: (error as Error).message }
  }
}

export const getConfigByKey = async (groupKey: string, configKey: string) => {
  try {
    // 根据不同的 saveType 进行不同的保存操作
    const group = findGroupByKey(groupKey)
    if (!group) {
      throw new Error(`找不到配置组：${groupKey}`)
    }
    const configItem = group.list.find((item) => item.key === configKey)
    if (!configItem) {
      throw new Error(`找不到配置项：${configKey}`)
    }
    return { success: true, data: configItem.value }
  } catch (error) {
    console.error('保存配置失败:', error)
    return { success: false, message: (error as Error).message }
  }
}

export const getPetSettings = async (): Promise<PetSettings> => {
  return {
    ...defaultPetSettings,
    ...(DefaultStoreHandler.get<Partial<PetSettings>>(PET_SETTINGS_GROUP_KEY) || {})
  }
}

export const savePetSettings = async (settings: Partial<PetSettings>) => {
  const nextSettings = {
    ...(await getPetSettings()),
    ...settings
  }

  DefaultStoreHandler.set(PET_SETTINGS_GROUP_KEY, nextSettings)
  return nextSettings
}

export const getHearingSettings = async (): Promise<HearingSettings> => {
  return {
    ...defaultHearingSettings,
    ...(DefaultStoreHandler.get<Partial<HearingSettings>>(HEARING_SETTINGS_GROUP_KEY) || {})
  }
}

export const saveHearingSettings = async (settings: Partial<HearingSettings>) => {
  const nextSettings = {
    ...(await getHearingSettings()),
    ...settings
  }

  DefaultStoreHandler.set(HEARING_SETTINGS_GROUP_KEY, nextSettings)
  return nextSettings
}

// 保存单个配置项
export const saveConfigItem = async (groupKey: string, configKey: string, value: any) => {
  try {
    // 根据不同的 saveType 进行不同的保存操作
    const group = findGroupByKey(groupKey)
    if (!group) {
      throw new Error(`找不到配置组：${groupKey}`)
    }

    const configItem = group.list.find((item) => item.key === configKey)
    if (!configItem) {
      throw new Error(`找不到配置项：${configKey}`)
    }

    switch (group.saveType) {
      case 'localEnv':
        // 保存到本地环境变量
        await saveToEnvFile({ [configKey]: value })
        // 立即更新进程的环境变量
        process.env[configKey] = String(value)
        break
      case 'cache':
        // 获取现有的缓存数据，更新单个配置项
        const existingValues = DefaultStoreHandler.get<Record<string, any>>(groupKey) || {}
        existingValues[configKey] = value
        DefaultStoreHandler.set(groupKey, existingValues)
        break
      case 'systemVar':
        // 系统变量由 SystemVarInput 组件自己处理，这里不需要额外操作
        break
      case 'remote':
        // 保存到远程（单个配置项）
        await saveToRemote(groupKey, { [configKey]: value })
        break
    }

    // 更新内存中的配置值
    updateConfigValues(groupKey, { [configKey]: value })

    return { success: true }
  } catch (error) {
    console.error('保存单个配置项失败:', error)
    return { success: false, message: (error as Error).message }
  }
}
// 查找配置组
const findGroupByKey = (groupKey: string): ConfigGroup | undefined => {
  for (const tab of configParams) {
    const group = tab.groups.find((g) => g.groupKey === groupKey)
    if (group) return group
  }
  return undefined
}

// 更新配置值
const updateConfigValues = (groupKey: string, values: Record<string, any>) => {
  const group = findGroupByKey(groupKey)
  if (!group) return

  for (const item of group.list) {
    if (values[item.key] !== undefined) {
      item.value = values[item.key]
    }
  }
}

// 加载环境变量文件
const loadEnvFile = async () => {
  try {
    const envPath = path.join(app.getPath('userData'), '.env')
    const envContent = await fs.promises.readFile(envPath, 'utf-8')
    // 解析并设置环境变量
    const envValues = envContent
      .split('\n')
      .filter((line) => line.trim())
      .reduce(
        (acc, line) => {
          const [key, value] = line.split('=').map((part) => part.trim())
          if (key && value) {
            acc[key] = value
          }
          return acc
        },
        {} as Record<string, string>
      )

    // 设置到进程环境变量
    Object.entries(envValues).forEach(([key, value]) => {
      process.env[key] = value
    })
  } catch (error) {
    // 文件不存在时忽略错误
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

// 保存到环境变量文件
const saveToEnvFile = async (values: Record<string, any>) => {
  const envPath = path.join(app.getPath('userData'), '.env')
  const envContent = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  await fs.promises.writeFile(envPath, envContent, 'utf-8')
}

// 保存到远程
const saveToRemote = async (_groupKey: string, _values: Record<string, any>) => {
  // TODO: 实现远程保存逻辑
  throw new Error('远程保存功能尚未实现')
}

// 系统变量管理
const SYSTEM_VAR_KEYS_STORE_KEY = 'systemVarKeys'
const SYSTEM_VAR_HIDDEN_KEYS_STORE_KEY = 'systemVarHiddenKeys'

// 获取系统变量键列表
export const getSystemVarKeys = async () => {
  try {
    const keys = DefaultStoreHandler.get<string[]>(SYSTEM_VAR_KEYS_STORE_KEY) || []
    const hiddenKeys = DefaultStoreHandler.get<string[]>(SYSTEM_VAR_HIDDEN_KEYS_STORE_KEY) || []

    return {
      success: true,
      data: {
        keys,
        hiddenKeys
      }
    }
  } catch (error) {
    console.error('获取系统变量键列表失败:', error)
    return { success: false, message: (error as Error).message }
  }
}

// 获取系统变量值列表
export const getSystemVarValues = async (keys: string[]) => {
  try {
    const values: Record<string, string> = {}
    const hiddenKeys = DefaultStoreHandler.get<string[]>(SYSTEM_VAR_HIDDEN_KEYS_STORE_KEY) || []

    keys.forEach((key) => {
      const value = process.env[key] || ''
      // 对于隐藏的键，用星号掩码显示
      if (hiddenKeys.includes(key) && value) {
        values[key] = '*'.repeat(value.length)
      } else {
        values[key] = value
      }
    })

    return {
      success: true,
      data: values
    }
  } catch (error) {
    console.error('获取系统变量值失败:', error)
    return { success: false, message: (error as Error).message }
  }
}

// 设置系统变量值
export const setSystemVarValues = async (
  values: Record<string, string>,
  updateKeys?: string[],
  updateHiddenKeys?: string[]
) => {
  try {
    if (!values || !Object.entries(values) || !Object.entries(values).length) {
      return { success: false, message: '没有合法的数据' }
    }
    // 更新环境变量
    Object.entries(values).forEach(([key, value]) => {
      if (value) {
        process.env[key] = value
      } else {
        delete process.env[key]
      }
    })

    // 保存到环境变量文件
    await saveToEnvFile(values)

    // 更新键列表（如果提供）
    if (updateKeys) {
      DefaultStoreHandler.set(SYSTEM_VAR_KEYS_STORE_KEY, updateKeys)
    }

    // 更新隐藏键列表（如果提供）
    if (updateHiddenKeys) {
      DefaultStoreHandler.set(SYSTEM_VAR_HIDDEN_KEYS_STORE_KEY, updateHiddenKeys)
    }

    return { success: true }
  } catch (error) {
    console.error('设置系统变量失败:', error)
    return { success: false, message: (error as Error).message }
  }
}
