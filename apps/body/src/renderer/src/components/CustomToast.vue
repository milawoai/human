<script setup lang="ts">
import { computed } from 'vue'

export interface ToastItem {
  id: string
  message: string
  type: 'success' | 'info' | 'fail'
  position: 'right' | 'center' | 'top'
  duration: number
  visible: boolean
  timer?: number
}

// Props
const props = defineProps<{
  toasts: ToastItem[]
}>()

// Emits
const emit = defineEmits<{
  remove: [id: string]
}>()

// 按位置分组 toasts
const toastsByPosition = computed(() => {
  const groups = {
    right: [] as ToastItem[],
    center: [] as ToastItem[],
    top: [] as ToastItem[]
  }

  props.toasts.forEach((toast) => {
    groups[toast.position].push(toast)
  })

  return groups
})

// Toast 图标
const getIcon = (type: string) => {
  switch (type) {
    case 'success':
      return '✓'
    case 'info':
      return 'ℹ'
    case 'fail':
      return '✕'
    default:
      return 'ℹ'
  }
}

// 移除 Toast
const removeToast = (id: string) => {
  emit('remove', id)
}

// 简化版本：不实现悬停暂停功能，避免复杂性
// 如果需要悬停暂停功能，可以后续添加更精确的剩余时间计算
</script>

<template>
  <Teleport to="body">
    <!-- 右上角位置 -->
    <Transition name="slide-right" appear>
      <div v-if="toastsByPosition.right.length > 0" class="fixed top-4 right-4 z-[9999] space-y-2">
        <TransitionGroup name="toast-list" tag="div" class="space-y-2">
          <div
            v-for="toast in toastsByPosition.right"
            :key="toast.id"
            :class="[
              'min-w-[300px] max-w-[400px] p-4 rounded-lg shadow-lg border flex items-center gap-3 cursor-pointer transition-all duration-200 hover:scale-105',
              {
                'bg-green-500 border-green-600 text-white': toast.type === 'success',
                'bg-blue-500 border-blue-600 text-white': toast.type === 'info',
                'bg-red-500 border-red-600 text-white': toast.type === 'fail'
              }
            ]"
            @click="removeToast(toast.id)"
          >
            <div class="text-xl font-bold">{{ getIcon(toast.type) }}</div>
            <div class="flex-1 text-sm font-medium">{{ toast.message }}</div>
            <button
              class="text-white/70 hover:text-white text-lg leading-none"
              @click.stop="removeToast(toast.id)"
            >
              ×
            </button>
          </div>
        </TransitionGroup>
      </div>
    </Transition>

    <!-- 页面中央位置 -->
    <Transition name="fade" appear>
      <div
        v-if="toastsByPosition.center.length > 0"
        class="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
      >
        <TransitionGroup name="toast-center" tag="div" class="space-y-4">
          <div
            v-for="toast in toastsByPosition.center"
            :key="toast.id"
            :class="[
              'min-w-[280px] max-w-[500px] p-6 rounded-xl shadow-2xl border flex items-center gap-4 cursor-pointer transition-all duration-300 hover:scale-105 pointer-events-auto',
              {
                'bg-green-500 border-green-600 text-white': toast.type === 'success',
                'bg-blue-500 border-blue-600 text-white': toast.type === 'info',
                'bg-red-500 border-red-600 text-white': toast.type === 'fail'
              }
            ]"
            @click="removeToast(toast.id)"
          >
            <div class="text-2xl font-bold">{{ getIcon(toast.type) }}</div>
            <div class="flex-1 text-base font-medium">{{ toast.message }}</div>
            <button
              class="text-white/70 hover:text-white text-xl leading-none"
              @click.stop="removeToast(toast.id)"
            >
              ×
            </button>
          </div>
        </TransitionGroup>
      </div>
    </Transition>

    <!-- 页面顶部位置 -->
    <Transition name="slide-down" appear>
      <div
        v-if="toastsByPosition.top.length > 0"
        class="fixed top-0 left-1/2 transform -translate-x-1/2 z-[9999] space-y-2 mt-4"
      >
        <TransitionGroup name="toast-list" tag="div" class="space-y-2">
          <div
            v-for="toast in toastsByPosition.top"
            :key="toast.id"
            :class="[
              'min-w-[300px] max-w-[600px] p-4 rounded-lg shadow-lg border flex items-center gap-3 cursor-pointer transition-all duration-200 hover:scale-105',
              {
                'bg-green-500 border-green-600 text-white': toast.type === 'success',
                'bg-blue-500 border-blue-600 text-white': toast.type === 'info',
                'bg-red-500 border-red-600 text-white': toast.type === 'fail'
              }
            ]"
            @click="removeToast(toast.id)"
          >
            <div class="text-xl font-bold">{{ getIcon(toast.type) }}</div>
            <div class="flex-1 text-sm font-medium">{{ toast.message }}</div>
            <button
              class="text-white/70 hover:text-white text-lg leading-none"
              @click.stop="removeToast(toast.id)"
            >
              ×
            </button>
          </div>
        </TransitionGroup>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 右侧滑入动画 */
.slide-right-enter-active {
  transition: all 0.3s ease-out;
}

.slide-right-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

/* 顶部滑入动画 */
.slide-down-enter-active {
  transition: all 0.3s ease-out;
}

.slide-down-enter-from {
  transform: translateY(-100%);
  opacity: 0;
}

/* 中央渐入动画 */
.fade-enter-active {
  transition: all 0.3s ease-out;
}

.fade-enter-from {
  opacity: 0;
  transform: scale(0.9);
}

/* Toast 列表动画 */
.toast-list-move,
.toast-list-enter-active,
.toast-list-leave-active {
  transition: all 0.3s ease;
}

.toast-list-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.toast-list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.toast-list-leave-active {
  position: absolute;
  right: 0;
}

/* 中央 Toast 动画 */
.toast-center-move,
.toast-center-enter-active,
.toast-center-leave-active {
  transition: all 0.4s ease;
}

.toast-center-enter-from {
  opacity: 0;
  transform: scale(0.8);
}

.toast-center-leave-to {
  opacity: 0;
  transform: scale(0.8);
}
</style>
