<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref } from 'vue'
import type { BackendConfig, BackendLifecycleView, BackendName } from '@shared/backendLifecycle'
import type { IpcProxy } from '@renderer/plugin/ipc'
const ipc = inject<IpcProxy>('ipc')!
const info = ref<BackendLifecycleView>()
const config = ref<BackendConfig>()
const message = ref('')
const busy = ref(false)
const labels = { node: 'Node / Neural', python: 'Python 听觉服务' }
async function refresh(reset = false) {
  const result = await ipc.backendLifecycle.status()
  if (result.success) {
    info.value = result.data
    if (reset || !config.value) config.value = structuredClone(result.data.config)
  }
}
async function act(action: 'retry' | 'restart' | 'applyConfig', name?: BackendName) {
  busy.value = true
  message.value = ''
  try {
    const result = await ipc.backendLifecycle[action](action === 'applyConfig' ? config.value : name)
    if (!result.success) message.value = result.msg || '操作失败，请检查服务状态'
    await refresh(result.success)
  } catch (error) { message.value = String(error) } finally { busy.value = false }
}
const changed = () => { void refresh() }
onMounted(() => { void refresh(); window.electron.ipcRenderer.on('backend:state', changed) })
onUnmounted(() => window.electron.ipcRenderer.removeListener('backend:state', changed))
</script>
<template>
  <section class="backend-panel">
    <h2>后端服务</h2>
    <p>自动托管会复用兼容服务；仅连接适合手动调试。只有本次托管的服务会随应用退出。</p>
    <article v-for="name in (['node', 'python'] as const)" :key="name">
      <h3>{{ labels[name] }}</h3>
      <p>{{ info?.snapshot?.[name]?.phase || '未初始化' }} · {{ info?.snapshot?.[name]?.ownership || '待检测' }} · 配置来源：{{ info?.sources?.[name] || '默认' }}</p>
      <p v-if="info?.snapshot?.[name]?.error" role="alert">{{ info.snapshot[name].error }}</p>
      <div v-if="config?.[name]">
        <label>启动方式 <select v-model="config[name].policy" :disabled="busy"><option value="auto">自动托管</option><option value="connect-only">仅连接</option></select></label>
        <label>固定端口 <input v-model.number="config[name].port" :disabled="busy" type="number" min="1" max="65535" /></label>
        <button :disabled="busy || info?.snapshot?.[name]?.ownership !== 'owned'" @click="act('restart', name)">重启本次托管服务</button>
      </div>
    </article>
    <p v-if="info?.configurationError" role="alert">{{ info.configurationError }}</p>
    <p v-if="info?.businessError">{{ info.businessError }}</p>
    <p v-if="message" role="alert">{{ message }}</p>
    <button :disabled="busy" @click="act('retry')">重新检测</button>
    <button :disabled="busy || !config" @click="act('applyConfig')">应用配置并重连</button>
    <p>外部服务请先停止原终端或调试器再重启；未知端口占用不会被自动结束。开发启动覆盖存在时，以配置来源显示的有效值为准。</p>
  </section>
</template>
<style scoped>
.backend-panel { padding: var(--human-space-card); border:1px solid var(--human-border); border-radius: var(--human-radius-md); }
article { margin: var(--human-spacing-4) 0; } label { display: inline-flex; gap: var(--human-spacing-2); margin-right: var(--human-spacing-3); }
button { margin: var(--human-spacing-1); padding: var(--human-spacing-1) var(--human-spacing-3); } input { width: 90px; }
</style>
