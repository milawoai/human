/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-21 16:38:15
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2026-02-12 11:44:57
 * @FilePath: /copy_code_desk/src/renderer/src/router/index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/agent-panel',
    name: 'agent-panel',
    component: () => import('@renderer/pages/agent-panel/index.vue')
  },
  {
    path: '/',
    name: 'pet-settings-home',
    component: () => import('@renderer/pages/pet-settings/index.vue')
  },
  {
    path: '/hello',
    name: 'hello',
    component: () => import('@renderer/pages/hello/index.vue')
  },
  {
    path: '/pet',
    name: 'pet',
    component: () => import('@renderer/pages/pet/index.vue')
  },
  {
    path: '/pet-settings',
    name: 'pet-settings',
    component: () => import('@renderer/pages/pet-settings/index.vue')
  },
  {
    path: '/hearing-panel',
    name: 'hearing-panel',
    component: () => import('@renderer/pages/hearing-panel/index.vue')
  },
  {
    path: '/chat-panel',
    name: 'chat-panel',
    component: () => import('@renderer/pages/chat-panel/index.vue')
  },
  {
    path: '/config',
    name: 'config',
    component: () => import('@renderer/pages/config/index.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach(async (to, from, next) => {
  console.log('beforeEach', to, from)
  next()
})

export default router
