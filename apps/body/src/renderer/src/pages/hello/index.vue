<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { StartupSnapshot } from '@shared/startup'

const progress = ref<StartupSnapshot>({ revision: -1, state: 'loading', message: '准备启动', stages: [] })
const finished = computed(() => progress.value.stages.filter(stage => stage.state === 'done'))
const color = computed(() => progress.value.state === 'failed' ? '#ef4444' : progress.value.state === 'done' ? '#22c55e' : '#6366f1')
let mounted = false
const accept = (snapshot: StartupSnapshot) => {
  if (mounted && snapshot.revision >= progress.value.revision) progress.value = snapshot
}
const changed = (_event: unknown, snapshot: StartupSnapshot) => accept(snapshot)
const openSettings = () => window.electron.ipcRenderer.invoke('backendLifecycle-openSettings')
onMounted(async () => {
  mounted = true
  const ipc = window.electron.ipcRenderer
  ipc.on('startup:state', changed)
  try {
    const result = await ipc.invoke('startup-status')
    if (result.success) accept(result.data)
  } catch { /* Live events may still arrive; main process handles load failures. */ }
})
onUnmounted(() => {
  mounted = false
  window.electron.ipcRenderer.removeListener('startup:state', changed)
})
</script>

<template>
  <div class="hello-window">
    <main class="hello-content">
      <svg class="hello-icon" width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <circle cx="24" cy="24" r="22" :stroke="color" stroke-width="2" :class="{ pulse: progress.state === 'loading' }" />
        <circle cx="24" cy="24" r="8" :fill="color" />
      </svg>
      <h1>Human</h1>
      <ul aria-label="已完成的初始化">
        <li v-for="stage in finished" :key="stage.id">✓ {{ stage.message }}</li>
      </ul>
      <footer>
        <p class="hello-status" :class="{ failed: progress.state === 'failed' }" role="status" aria-live="polite">{{ progress.message }}</p>
        <button @click="openSettings">打开设置与诊断</button>
      </footer>
    </main>
  </div>
</template>

<style scoped>
:global(html:has(.hello-window)),
:global(body:has(.hello-window)),
:global(#app:has(.hello-window)) { background: transparent !important; overflow: hidden; }
.hello-window { width: 100vw; height: 100vh; display: grid; place-items: center; user-select: none; -webkit-app-region: drag; }
.hello-content { box-sizing: border-box; width: 360px; height: 280px; padding: 24px 32px 16px; display: flex; flex-direction: column; align-items: center; background: rgba(30, 30, 40, .96); border-radius: 16px; border: 1px solid rgba(99, 102, 241, .25); color: #f1f5f9; box-shadow: 0 8px 24px #0005; }
h1 { font-size: 20px; letter-spacing: 2px; margin: 8px 0; }
ul { list-style: none; padding: 0; margin: 4px 0; font-size: 12px; color: #86efac; max-height: 72px; overflow-y: auto; -webkit-app-region: no-drag; }
li { margin-bottom: 3px; }
footer { margin-top: auto; width: 100%; text-align: center; }
.hello-status { font-size: 13px; margin: 8px 0; overflow-wrap: anywhere; }
.failed { color: #fca5a5; }
button { -webkit-app-region: no-drag; font-size: 11px; border: 0; padding: 3px 6px; background: transparent; color: #a5b4fc; cursor: pointer; }
.pulse { animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .4; } }
</style>
