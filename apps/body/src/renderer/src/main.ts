/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-18 00:17:46
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2026-02-12 11:40:18
 * @FilePath: /copy_code_desk/src/renderer/src/main.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
// import './assets/main.css'
import Aura from '@primeuix/themes/aura'
import { setIpcInstance } from '@renderer/api/base'
import { createIpcPlugin } from '@renderer/plugin/ipc'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import { createApp } from 'vue'
import App from './App.vue'
import './assets/styles.scss'
import router from './router'
import ComponentsPlugin from '@renderer/components/index'
import '@tdesign-vue-next/chat/es/style/index.css'
import Tooltip from 'primevue/tooltip'
import i18n from './i18n'

const app = createApp(App)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.app-dark'
    }
  }
})
app.use(ConfirmationService)
app.use(ToastService)
app.use(i18n)
app.use(createIpcPlugin())
// 全局注册组件
// app.component('SelectFolderLine', SelectFolderLine)
// app.component('AIDrawer', AIDrawer)
app.use(ComponentsPlugin)
app.use(router)
app.mount('#app')
app.directive('tooltip', Tooltip)
// 初始化 IPC 实例供 base API 使用
setTimeout(() => {
  const ipc = app.config.globalProperties.$ipc
  if (ipc) {
    setIpcInstance(ipc)
  }
}, 0)
