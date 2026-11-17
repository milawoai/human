export interface ApiRequestParams<TReq = any> {
  method: string
  url: string
  reqParams?: TReq // 请求参数，可选
  headers?: Record<string, string> // 自定义请求头
  timeout?: number // 请求超时时间
  responseType?: 'json' | 'blob' | 'arraybuffer' | 'text' // 响应类型
}

// 通用的 API 请求响应类型
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  msg?: string // 别名，兼容不同后端返回格式
  code?: number
}

// 模板详情结果类型
export interface TemplateResult {
  templateId: string
  templateName: string
  templateMetaJson: string
  templateMethodJson: string
  staticParamsValuesJson: string | null
  methodConfigJson: string | null
  scriptPath: string
}

// 模板方法配置类型

export interface TemplateMethod {
  id: string
  name: string
  description: string
  category: string
  enabled: boolean
  staticParams: ParamsConfig
  dynamicParams: ParamsConfig
  concatParams: ConcatParamsConfig
  implementation: ImplementationConfig
}

export interface ParamsConfig {
  fields: ParamField[]
  layout: 'vertical' | 'horizontal'
}

export interface ParamField {
  key: string
  renderType: string
  renderLabel: string
  defaultValue?: string
}

export interface ConcatParamsConfig {
  params: ConcatParam[]
}

export interface ConcatParam {
  key: string
  value: string
  transformer?: string // 可选的转换器名称
  transformerParams?: string[] // 转换器所需的参数列表
}

export interface ImplementationConfig {
  type: string
  steps: ImplementationStep[]
}
export interface ImplementationStep {
  index: number
  op: string
  title: string
  prompt: string
  params: StepParam[]
  nextIndex?: number
  yesNextIndex?: number
  noNextIndex?: number
}
export interface StepParam {
  key: string
  desc: string
  paramsKeys: string
}
export interface GeneratePromptData {
  staticParams: Record<string, any>
  dynamicParams: Record<string, any>
  concatParams: Record<string, string>
  implementation: ImplementationConfig
  projectPath: string
  templateName: string
}
