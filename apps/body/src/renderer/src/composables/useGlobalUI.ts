import { ref } from 'vue'
import {
  showGlobalToast,
  showSuccess as showCustomSuccess,
  showInfo as showCustomInfo,
  showFail as showCustomFail,
  type ToastOptions
} from './useCustomToast'

// 重新导出类型
export type { ToastOptions as ToastMessage }

// 全局 loading 状态
const isGlobalLoading = ref(false)
const loadingText = ref('加载中...')

export function useGlobalUI() {
  // Loading 控制方法
  const showLoading = (text: string = '加载中...') => {
    loadingText.value = text
    isGlobalLoading.value = true
  }

  const hideLoading = () => {
    isGlobalLoading.value = false
  }

  // Toast 便捷方法
  const showToast = (message: string, options: ToastOptions = {}) => {
    return showGlobalToast(message, options)
  }

  const showSuccess = (message: string, options: Omit<ToastOptions, 'type'> = {}) => {
    return showCustomSuccess(message, options)
  }

  const showError = (message: string, options: Omit<ToastOptions, 'type'> = {}) => {
    return showCustomFail(message, options)
  }

  const showWarning = (message: string, options: Omit<ToastOptions, 'type'> = {}) => {
    return showCustomInfo(message, options)
  }

  const showInfo = (message: string, options: Omit<ToastOptions, 'type'> = {}) => {
    return showCustomInfo(message, options)
  }

  // 异步操作包装器
  const withLoading = async <T>(
    asyncFn: () => Promise<T>,
    loadingMsg: string = '处理中...'
  ): Promise<T> => {
    try {
      showLoading(loadingMsg)
      const result = await asyncFn()
      return result
    } finally {
      hideLoading()
    }
  }

  // 异步操作包装器 + 错误处理
  const withLoadingAndToast = async <T>(
    asyncFn: () => Promise<T>,
    options: {
      loadingMsg?: string
      successMsg?: string
      errorMsg?: string
    } = {}
  ): Promise<T | null> => {
    try {
      showLoading(options.loadingMsg || '处理中...')
      const result = await asyncFn()
      if (result && result['success'] === false) {
        showError(result['message'] || options.errorMsg)
        return result
      }
      if (options.successMsg) {
        showSuccess(options.successMsg)
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '操作失败'
      showError(options.errorMsg || errorMessage)
      return null
    } finally {
      hideLoading()
    }
  }

  return {
    // Loading state
    isGlobalLoading,
    loadingText,

    // Loading methods
    showLoading,
    hideLoading,

    // Toast methods
    showToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,

    // Utility methods
    withLoading,
    withLoadingAndToast
  }
}
