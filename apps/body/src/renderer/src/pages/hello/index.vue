<template>
  <div class="hello-window">
    <div class="hello-content">
      <div class="hello-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" stroke="#6366f1" stroke-width="2" :class="{ 'pulse-ring': isConnecting }" />
          <circle cx="24" cy="24" r="8" :fill="statusColor" />
        </svg>
      </div>
      <div class="hello-title">Human</div>
      <div class="hello-status" :class="statusClass">{{ statusText }}</div>
      <div v-if="errorMessage" class="hello-error">{{ errorMessage }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'

const state = ref('connecting') // connecting | connected | error
const errorMessage = ref('')

const statusText = computed(() => {
  switch (state.value) {
    case 'connecting':
      return '正在连接 Neural Core...'
    case 'connected':
      return 'Neural Core 已连接'
    case 'error':
      return '连接失败'
    default:
      return ''
  }
})

const statusClass = computed(() => `status-${state.value}`)

const statusColor = computed(() => {
  switch (state.value) {
    case 'connecting':
      return '#f59e0b'
    case 'connected':
      return '#22c55e'
    case 'error':
      return '#ef4444'
    default:
      return '#94a3b8'
  }
})

const isConnecting = computed(() => state.value === 'connecting')

// 监听主进程推送的连接状态变化
const handleNeuralState = (_, data) => {
  if (data.state === 'registered' || data.state === 'connected') {
    state.value = 'connected'
  } else if (data.state === 'error') {
    state.value = 'error'
    errorMessage.value = data.msg || '连接异常'
  }
}

onMounted(() => {
  // 注册监听主进程推送的 Neural 状态
  window.electron?.ipcRenderer?.on('neural:state', handleNeuralState)
})

onUnmounted(() => {
  window.electron?.ipcRenderer?.removeListener('neural:state', handleNeuralState)
})
</script>

<style scoped>
.hello-window {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  user-select: none;
  -webkit-app-region: drag;
}

.hello-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 48px;
  background: rgba(30, 30, 40, 0.95);
  border-radius: 16px;
  backdrop-filter: blur(20px);
  border: 1px solid rgba(99, 102, 241, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.hello-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.hello-title {
  font-size: 20px;
  font-weight: 700;
  color: #f1f5f9;
  letter-spacing: 2px;
}

.hello-status {
  font-size: 13px;
  color: #94a3b8;
}

.hello-status.status-connected {
  color: #22c55e;
}

.hello-status.status-error {
  color: #ef4444;
}

.hello-error {
  font-size: 11px;
  color: #94a3b8;
  max-width: 280px;
  text-align: center;
  word-break: break-all;
}

.pulse-ring {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    stroke-width: 2;
  }
  50% {
    opacity: 0.5;
    stroke-width: 4;
  }
}
</style>
