import { ref } from 'vue'

export interface ToastOptions {
  type?: 'success' | 'info' | 'fail'
  position?: 'right' | 'center' | 'top'
  duration?: number
}

export interface ToastItem {
  id: string
  message: string
  type: 'success' | 'info' | 'fail'
  position: 'right' | 'center' | 'top'
  duration: number
  visible: boolean
  timer?: number
}

// 全局 Toast 状态
const toasts = ref<ToastItem[]>([])

// 生成唯一 ID
const generateId = () => `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

// 默认配置
const defaultOptions: Required<ToastOptions> = {
  type: 'info',
  position: 'right',
  duration: 3000
}

// 显示 Toast 的核心方法
export function showGlobalToast(message: string, options: ToastOptions = {}): string {
  const finalOptions = { ...defaultOptions, ...options }

  const toast: ToastItem = {
    id: generateId(),
    message,
    type: finalOptions.type,
    position: finalOptions.position,
    duration: finalOptions.duration,
    visible: true
  }

  // 添加到队列
  toasts.value.push(toast)

  // 设置自动移除定时器
  if (finalOptions.duration > 0) {
    toast.timer = window.setTimeout(() => {
      removeToast(toast.id)
    }, finalOptions.duration)
  }

  // 限制同位置最大显示数量
  limitToastsByPosition(finalOptions.position)

  return toast.id
}

// 限制同位置的 Toast 数量
function limitToastsByPosition(position: string, maxCount: number = 5) {
  const samePositionToasts = toasts.value.filter((t) => t.position === position)
  if (samePositionToasts.length > maxCount) {
    // 移除最旧的
    const oldestToast = samePositionToasts[0]
    removeToast(oldestToast.id)
  }
}

// 移除 Toast
export function removeToast(id: string) {
  const index = toasts.value.findIndex((t) => t.id === id)
  if (index > -1) {
    const toast = toasts.value[index]
    if (toast.timer) {
      clearTimeout(toast.timer)
    }
    toasts.value.splice(index, 1)
  }
}

// 清除所有 Toast
export function clearAllToasts() {
  toasts.value.forEach((toast) => {
    if (toast.timer) {
      clearTimeout(toast.timer)
    }
  })
  toasts.value = []
}

// 便捷方法
export function showSuccess(message: string, options: Omit<ToastOptions, 'type'> = {}) {
  return showGlobalToast(message, { ...options, type: 'success' })
}

export function showInfo(message: string, options: Omit<ToastOptions, 'type'> = {}) {
  return showGlobalToast(message, { ...options, type: 'info' })
}

export function showFail(message: string, options: Omit<ToastOptions, 'type'> = {}) {
  return showGlobalToast(message, { ...options, type: 'fail' })
}

// 位置便捷方法
export function showToastRight(
  message: string,
  type: 'success' | 'info' | 'fail' = 'info',
  duration: number = 3000
) {
  return showGlobalToast(message, { type, position: 'right', duration })
}

export function showToastCenter(
  message: string,
  type: 'success' | 'info' | 'fail' = 'info',
  duration: number = 4000
) {
  return showGlobalToast(message, { type, position: 'center', duration })
}

export function showToastTop(
  message: string,
  type: 'success' | 'info' | 'fail' = 'info',
  duration: number = 3000
) {
  return showGlobalToast(message, { type, position: 'top', duration })
}

// Composable
export function useCustomToast() {
  return {
    // 状态
    toasts,

    // 核心方法
    showGlobalToast,
    removeToast,
    clearAllToasts,

    // 便捷方法
    showSuccess,
    showInfo,
    showFail,

    // 位置方法
    showToastRight,
    showToastCenter,
    showToastTop
  }
}
