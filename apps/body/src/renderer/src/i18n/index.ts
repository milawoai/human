import { createI18n } from 'vue-i18n'
import en from '../locales/en.json'
import zh from '../locales/zh.json'

export type MessageSchema = typeof zh

// 获取系统默认语言，优先级：存储的语言设置 > 系统语言 > 默认中文
const getDefaultLocale = (): 'zh' | 'en' => {
  // 从 localStorage 读取保存的语言设置
  const savedLocale = localStorage.getItem('app-locale')
  if (savedLocale === 'zh' || savedLocale === 'en') {
    return savedLocale
  }

  // 获取系统语言
  const systemLocale = navigator.language.toLowerCase()
  if (systemLocale.includes('zh')) {
    return 'zh'
  }

  return 'zh' // 默认中文
}

const i18n = createI18n<[MessageSchema], 'zh' | 'en'>({
  legacy: false,
  locale: getDefaultLocale(),
  fallbackLocale: 'en',
  messages: {
    zh,
    en
  }
})

export default i18n
