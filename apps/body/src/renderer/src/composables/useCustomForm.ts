import { ref, computed } from 'vue'
import type { FormConfig } from '@shared/types/render'

export interface UseCustomFormOptions {
  onSubmit?: (data: Record<string, any>) => void
  onCancel?: () => void
  onChange?: (key: string, value: any) => void
  initialData?: Record<string, any>
}

// 配置参数可以是 FormConfig 或返回 FormConfig 的函数
export type FormConfigGetter = FormConfig | (() => FormConfig)

export function useCustomForm(configGetter: FormConfigGetter, options: UseCustomFormOptions = {}) {
  const dialogVisible = ref(false)
  const formData = ref<Record<string, any>>({})
  const formConfig = computed(() => {
    return typeof configGetter === 'function' ? configGetter() : configGetter
  })

  // 初始化表单数据
  const initFormData = () => {
    const data: Record<string, any> = {}
    formConfig.value.fields.forEach((field) => {
      data[field.key] = field.value ?? ''
    })
    formData.value = { ...data, ...options.initialData }
  }

  // 初始化
  initFormData()

  // 显示弹窗
  const showDialog = () => {
    dialogVisible.value = true
  }

  // 隐藏弹窗
  const hideDialog = () => {
    dialogVisible.value = false
  }

  // 处理表单提交
  const handleFormSubmit = (data: Record<string, any>) => {
    formData.value = { ...data }
    options.onSubmit?.(data)
    hideDialog()
  }

  // 处理表单取消
  const handleFormCancel = () => {
    options.onCancel?.()
    hideDialog()
  }

  // 处理表单字段变化
  const handleFormChange = (key: string, value: any) => {
    formData.value[key] = value
    options.onChange?.(key, value)
  }

  // 重置表单
  const resetForm = () => {
    initFormData()
  }

  // // 更新表单配置
  // const updateConfig = (newConfig: FormConfig) => {
  //   formConfig.value = newConfig
  //   initFormData()
  // }

  // 获取当前表单数据
  const getFormData = () => {
    return { ...formData.value }
  }

  // 设置表单数据
  const setFormData = (data: Record<string, any>) => {
    formData.value = { ...formData.value, ...data }
  }

  return {
    // 状态
    dialogVisible,
    formData,
    formConfig,

    // 方法
    showDialog,
    hideDialog,
    handleFormSubmit,
    handleFormCancel,
    handleFormChange,
    resetForm,
    // updateConfig,
    getFormData,
    setFormData
  }
}
