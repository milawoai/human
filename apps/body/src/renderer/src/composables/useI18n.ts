import type { IpcProxy } from '@renderer/plugin/ipc'
import { computed, inject, ref } from 'vue'
import { useI18n as useVueI18n } from 'vue-i18n'

const currentLocale = ref<'zh' | 'en'>('zh')

export const useI18n = () => {
  const { t, locale } = useVueI18n()
  const ipc = inject<IpcProxy>('ipc')!
  const switchLanguage = async (lang?: 'zh' | 'en') => {
    try {
      // 如果传入了参数，使用该参数；否则切换当前语言
      let newLang: 'zh' | 'en'
      if (lang) {
        newLang = lang
      } else {
        // 切换当前语言：zh -> en, en -> zh
        newLang = currentLocale.value === 'zh' ? 'en' : 'zh'
      }

      // 更新当前语言
      currentLocale.value = newLang

      // 通过 IPC 保存语言设置到主进程
      await ipc.common.setLocale(newLang)

      // 保存到 localStorage 以便刷新后保持设置
      localStorage.setItem('app-locale', newLang)

      // 切换 Vue i18n 的语言
      locale.value = newLang

      return true
    } catch (error) {
      console.error('Failed to switch language:', error)
      return false
    }
  }

  const getCurrentLanguage = async () => {
    try {
      // 从主进程获取当前语言设置
      const { success, data } = await ipc.common.getLocale()
      if (!success) {
        return 'zh'
      }
      if (typeof data !== 'string') {
        currentLocale.value = 'zh'
        locale.value = 'zh'
        return 'zh'
      } else {
        currentLocale.value = data as 'zh' | 'en'
        locale.value = data as 'zh' | 'en'
        return data as 'zh' | 'en'
      }
    } catch (error) {
      console.error('Failed to get current language:', error)
      return 'zh'
    }
  }

  const isZhCN = computed(() => currentLocale.value === 'zh')
  const isEN = computed(() => currentLocale.value === 'en')

  return {
    t,
    locale: currentLocale,
    switchLanguage,
    getCurrentLanguage,
    isZhCN,
    isEN
  }
}
