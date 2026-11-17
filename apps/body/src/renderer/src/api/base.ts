import axios, { AxiosRequestConfig } from 'axios'
import type { ApiRequestParams, ApiResponse } from '@shared/types/template'

// 创建 axios 实例
const axiosInstance = axios.create({
  timeout: 30000
  // 不设置默认 Content-Type，让每个请求自己决定
  // FormData 需要浏览器自动设置 multipart/form-data
  // JSON 请求会在下面的拦截器中设置
})

// 请求拦截器：为非 FormData 请求设置 JSON Content-Type
axiosInstance.interceptors.request.use((config) => {
  // 如果不是 FormData，设置为 JSON
  if (!(config.data instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json'
  }
  return config
})

// 全局变量存储 IPC 实例
let ipcInstance: any = null

// 全局配置:API 请求是否从主进程发出 (默认为 true)
let globalApiRequestFromMain: boolean = true

// 设置 IPC 实例的方法
export const setIpcInstance = (ipc: any) => {
  ipcInstance = ipc
  // 初始化时读取配置
  loadApiRequestConfig()
}

// 加载 API 请求配置
const loadApiRequestConfig = async () => {
  if (!ipcInstance) return

  try {
    const result = await ipcInstance.config.getConfigByKey(
      'api_request_settings',
      'api_request_from_main'
    )
    if (result.success && result.data !== undefined) {
      globalApiRequestFromMain = result.data
    }
  } catch (error) {
    console.warn('加载 API 请求配置失败,使用默认值:', error)
  }
}

// 手动刷新配置(供外部调用)
export const refreshApiRequestConfig = async () => {
  await loadApiRequestConfig()
}

// 获取当前配置值
export const getApiRequestFromMain = () => globalApiRequestFromMain

export const apiRequest = async <ReqT = any, ResT = any>(
  params: ApiRequestParams<ReqT>,
  toBack?: boolean
): Promise<ApiResponse<ResT>> => {
  // 如果 toBack 未指定,使用全局配置
  const shouldUseBack = toBack !== undefined ? toBack : globalApiRequestFromMain

  if (shouldUseBack) {
    // 使用 IPC 调用后端
    if (!ipcInstance) {
      throw new Error('IPC not available, please call setIpcInstance first')
    }

    return (await ipcInstance.common.apiRequest(params)) as ApiResponse<ResT>
  } else {
    // 使用 axios 直接调用
    try {
      const { method, url, reqParams, headers, timeout, responseType } = params

      // 检测是否为 FormData（文件上传）
      const isFormData = reqParams instanceof FormData

      const config: AxiosRequestConfig = {
        method,
        url,
        headers: headers || {},
        timeout: timeout || 30000,
        responseType: responseType || 'json' // 支持自定义响应类型
      }

      // 如果是 FormData，不设置 Content-Type，让浏览器自动设置
      if (isFormData) {
        // 删除可能存在的 Content-Type，让浏览器自动设置 multipart/form-data 和 boundary
        delete config.headers!['Content-Type']
      }

      // 根据请求方法处理参数
      if (method.toLowerCase() === 'get') {
        config.params = reqParams
      } else {
        config.data = reqParams
      }

      const response = await axiosInstance.request(config)

      // 如果响应类型是 blob，返回特殊格式的数据
      if (responseType === 'blob') {
        return {
          success: true,
          message: '请求成功',
          data: {
            blob: response.data,
            headers: response.headers
          } as any
        }
      }

      // 假设后端返回格式为 { code: 0, msg: '', data: {} }
      const responseData = response.data

      return {
        success: responseData.code === 0,
        message: responseData.msg,
        data: responseData.data
      }
    } catch (error: any) {
      // 如果是我们主动抛出的错误，直接抛出
      if (error.message && error.message !== '请求失败') {
        throw error
      }
      // 否则抛出网络错误
      throw new Error(error.message || '网络请求失败')
    }
  }
}
