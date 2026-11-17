export type HandlerConfig = {
  servicesName?: string
  ipcName?: string
  funcName?: string
  desc?: string
}

// 处理器定义类型
export type HandlersDefinition = {
  [K: string]: {
    [P: string]: HandlerConfig
  }
}

export type ServiceModule = {
  [key: string]: HandlerFunction
}

export interface ServiceFileModule {
  [key: string]: any
  default?: ServiceModule
}

export interface BaseResponse {
  success: boolean
  msg?: string | null
  data?: any | null
}

// 辅助类型，用于约束函数类型
export type HandlerFunction = (...args: any[]) => Promise<BaseResponse>
