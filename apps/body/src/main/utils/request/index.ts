import { getApiLogger } from '@main/utils/logger/requestLogger'
import type { ApiRequestParams, ApiResponse } from '@shared/types/template'
import axios, { AxiosError, AxiosHeaders, AxiosRequestConfig } from 'axios'
import DefaultStoreHandler from '../../store/index'
import DefaultSessionStoreHandler from '../../store/session'
// import { DefaultAuthService } from '../../services/feishuAuth'
import type { ShuidiReq } from '@shared/types/request'
// import https from 'https'

// const baseUrl = 'https://api.shuidihuzhu.com'
const baseUrl = 'http://127.0.0.1:7190'
let reloginLock: any | null = null
// const baseUrl =
//   process.env.NODE_ENV === 'development' ? 'http://localhost:10704' : 'https://api.shuidihuzhu.com'
// const baseURL = baseUrl + '/api/sdb/crm/im-robot/recruitment'
// 判断是否为完整的 URL
const isFullUrl = (url: string): boolean => {
  return /^(http|https):\/\//i.test(url)
}

// 规范化 URL 路径
const normalizeUrl = (url: string): string => {
  // 移除开头和结尾的斜杠
  url = url.replace(/^\/+|\/+$/g, '')
  return url
}

// 处理 URL
const getFullUrl = (url: string): string => {
  if (isFullUrl(url)) {
    return url
  }
  const apiUrl = DefaultSessionStoreHandler.get<string>('apiUrl', '') || baseUrl
  // apiUrl = apiUrl + '/api/sdb/crm/im-robot'
  // 规范化 baseURL（移除结尾斜杠）
  const normalizedBase = apiUrl.replace(/\/+$/, '')
  // 规范化 url（移除开头和结尾斜杠）
  const normalizedUrl = normalizeUrl(url)
  return `${normalizedBase}/${normalizedUrl}`
}

// 创建 axios 实例
const request = axios.create({
  timeout: 30000, // 默认超时时间：30秒
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    const sdUser = DefaultStoreHandler.get('sd-user')
    // const userConfig = ConfigStore.get<Config>('config')
    // 添加请求开始时间
    config['startTime'] = Date.now()
    if (config.url) {
      config.url = getFullUrl(config.url)
    }
    if (!config.headers) {
      config.headers = new AxiosHeaders()
    }
    if (sdUser && sdUser['token']) {
      config.headers.set('AuthorizationV2', sdUser['token'])
    }
    // // 修正变量名并设置 https 配置和代理
    // config.httpsAgent = new https.Agent({
    //   rejectUnauthorized: false, // 忽略 SSL 证书错误
    //   secureProtocol: 'TLS_method'
    // })
    // config.proxy = {
    //   protocol: 'http',
    //   host: '127.0.0.1',
    //   port: 8888  // Charles 默认端口
    // }
    // if (userConfig?.thorApiEnabled && userConfig?.trafficLabel) {
    //   const cookieValue = `thor_api=bedin;trafficlabel=${userConfig.trafficLabel};`
    //   // 添加或更新 Cookie
    //   if (config.headers) {
    //     if (config.headers.Cookie) {
    //       config.headers.Cookie += '; ' + cookieValue
    //     } else {
    //       config.headers.Cookie = cookieValue
    //     }
    //   } else {
    //     config.headers = new AxiosHeaders()
    //     config.headers.set('Cookie', cookieValue)
    //   }
    // }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    const config = response.config
    const endTime = Date.now()
    // 记录接口调用日志
    getApiLogger().log({
      type: 'request',
      method: config.method?.toUpperCase() || 'UNKNOWN',
      url: config.url || '',
      params: config.params,
      body: config.data,
      response: response.data,
      startTime: config['startTime'] || endTime,
      endTime
    })
    const { code } = response.data || {}
    return {
      ...response.data,
      success: Number(code) === 0
    }
  },
  (error: AxiosError) => {
    const config = error.config
    const endTime = Date.now()

    // 记录错误日志
    getApiLogger().log({
      type: 'request',
      method: config?.method?.toUpperCase() || 'UNKNOWN',
      url: config?.url || '',
      params: config?.params,
      body: config?.data,
      startTime: config?.['startTime'] || endTime,
      endTime,
      error: {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText
      }
    })

    // 统一的错误处理
    if (error.response) {
      switch (error.response.status) {
        case 401:
          // 处理未授权
          console.error('未授权，请重新登录')
          break
        case 403:
          console.error('拒绝访问')
          break
        case 404:
          console.error('请求的资源不存在')
          break
        case 500:
          console.error('服务器错误')
          break
        default:
          console.error(`连接错误 ${error.response.status}`)
      }
    } else if (error.request) {
      console.error('网络错误，请检查您的网络连接')
    } else {
      console.error('请求配置错误', error.message)
    }
    return Promise.reject(error)
  }
)

// 封装 GET 请求
export const get = <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => {
  return request.get(url, config) as Promise<T>
}

export const shuidiGet = async (
  url: string,
  config?: AxiosRequestConfig,
  ignoreUnLogin: boolean = false
) => {
  const { code, data, msg } = await get<ShuidiReq>(url, config)
  if (code !== 0) {
    if (!ignoreUnLogin && Number(code) === 77710301) {
      if (reloginLock) {
        return
      }
      reloginLock = true
      // 清除Token, 启动登录页
      DefaultStoreHandler.delete('sd-user')
      // 如果主窗口存在，通知渲染进程清除用户信息
      if (global.mainWindow) {
        global.mainWindow.webContents.send('clear-user-info')
      }
      // // 打开飞书登录窗口
      // DefaultAuthService.handleFeishuLogin()
    } else {
      throw new Error(msg ? msg : '请求失败')
    }
  } else {
    reloginLock = null
  }
  return data
}

// 封装 POST 请求
export const post = <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
  return request.post(url, data, config) as Promise<T>
}

export const shuidiPost = async (
  url: string,
  body?: any,
  config?: AxiosRequestConfig,
  ignoreUnLogin: boolean = false
) => {
  const { code, data, msg } = await post<ShuidiReq>(url, body, config)
  if (code !== 0) {
    if (!ignoreUnLogin && Number(code) === 77710301) {
      if (reloginLock) {
        return
      }
      reloginLock = true
      // 清除Token, 启动登录页
      DefaultStoreHandler.delete('sd-user')
      // 如果主窗口存在，通知渲染进程清除用户信息
      if (global.mainWindow) {
        global.mainWindow.webContents.send('clear-user-info')
      }
      // // 打开飞书登录窗口
      // DefaultAuthService.handleFeishuLogin()
    } else {
      throw new Error(msg ? msg : '请求失败')
    }
    // return { success: false, data, message: msg }
  } else {
    reloginLock = null
  }
  return data
  // return { success: true, data }
}

// 封装 PUT 请求
export const put = <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
  return request.put(url, data, config) as Promise<T>
}

// 封装 DELETE 请求
export const del = <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => {
  return request.delete(url, config) as Promise<T>
}

export const axiosRequest = async <TReq = any, TRes = any>(
  params: ApiRequestParams<TReq>
): Promise<ApiResponse<TRes>> => {
  try {
    const { method, url, reqParams, headers, timeout } = params

    // 构建请求配置
    const config: AxiosRequestConfig = {
      headers: headers || {},
      timeout: timeout || 30000
    }

    let response: any

    switch (method.toLowerCase()) {
      case 'get':
        // GET 请求参数作为 query parameters
        if (reqParams) {
          const queryString = new URLSearchParams(
            Object.entries(reqParams as Record<string, any>).reduce(
              (acc, [key, value]) => {
                if (value !== undefined && value !== null) {
                  acc[key] = String(value)
                }
                return acc
              },
              {} as Record<string, string>
            )
          ).toString()

          const separator = url.includes('?') ? '&' : '?'
          response = await get(`${url}${queryString ? separator + queryString : ''}`, config)
        } else {
          response = await get(url, config)
        }
        break

      case 'post':
        response = await post(url, reqParams, config)
        break

      case 'put':
        response = await put(url, reqParams, config)
        break

      case 'delete':
        response = await del(url, config)
        break

      default:
        throw new Error(`不支持的请求方法: ${method}`)
    }

    return {
      success: response.success || false,
      data: response.data,
      message: response.message || response.msg,
      code: response.code
    }
  } catch (error: any) {
    console.error('API 请求失败:', error)
    return {
      success: false,
      message: error.message || 'API 请求失败',
      code: error.response?.status
    }
  }
}
// 导出实例
export default request
