<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { StartupSnapshot } from '@shared/startup'

const progress = ref<StartupSnapshot>({ revision: -1, state: 'loading', message: '准备启动', stages: [] })
const finished = computed(() => progress.value.stages.filter(stage => stage.state === 'done'))
const color = computed(() => progress.value.state === 'failed' ? 'var(--human-danger)' : progress.value.state === 'done' ? 'var(--human-success)' : 'var(--human-accent)')
const progressArea = ref<HTMLElement>()
const progressContent = ref<HTMLElement>()
const scrollToLatest = () => {
  const area = progressArea.value
  if (area) area.scrollTop = area.scrollHeight
}
watch(() => progress.value.revision, scrollToLatest, { flush: 'post' })
let resizeObserver: ResizeObserver | undefined
let mounted = false
const accept = (snapshot: StartupSnapshot) => {
  if (mounted && snapshot.revision >= progress.value.revision) progress.value = snapshot
}
const changed = (_event: unknown, snapshot: StartupSnapshot) => accept(snapshot)
const openSettings = () => window.electron.ipcRenderer.invoke('backendLifecycle-openSettings')
onMounted(async () => {
  mounted = true
  resizeObserver = new ResizeObserver(scrollToLatest)
  if (progressArea.value) resizeObserver.observe(progressArea.value)
  if (progressContent.value) resizeObserver.observe(progressContent.value)
  const ipc = window.electron.ipcRenderer
  ipc.on('startup:state', changed)
  try {
    const result = await ipc.invoke('startup-status')
    if (result.success) accept(result.data)
  } catch { /* Live events may still arrive; main process handles load failures. */ }
})
onUnmounted(() => {
  mounted = false
  resizeObserver?.disconnect()
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
      <section ref="progressArea" class="hello-progress" tabindex="0" aria-label="初始化进度">
        <div ref="progressContent">
          <ul aria-label="已完成的初始化">
            <li v-for="stage in finished" :key="stage.id">✓ {{ stage.message }}</li>
          </ul>
          <p class="hello-status" :class="{ failed: progress.state === 'failed' }" role="status" aria-live="polite">{{ progress.message }}</p>
        </div>
      </section>
      <footer>
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
.hello-content { box-sizing:border-box; width:22.5rem; height:17.5rem; max-width:calc(100vw - var(--human-space-related)); max-height:calc(100vh - var(--human-space-related)); padding:var(--human-spacing-4) var(--human-spacing-6) var(--human-spacing-3); display:flex; flex-direction:column; align-items:center; background:var(--human-surface); border-radius: var(--human-radius-lg); border:1px solid var(--human-accent); color:var(--human-text); box-shadow:var(--human-shadow); }
h1 { flex-shrink:0; font-size:var(--human-text-title); letter-spacing:2px; line-height:1.2; margin:var(--human-spacing-1) 0; }
.hello-progress { flex:1; min-height:0; width:100%; overflow-y:auto; overflow-wrap:anywhere; text-align:center; scrollbar-color:var(--human-border) transparent; -webkit-app-region:no-drag; }
ul { list-style:none; padding:0; margin:var(--human-spacing-1) 0; font-size:var(--human-text-sm); color:var(--human-success); -webkit-app-region:no-drag; }
.hello-icon { width:40px; height:40px; flex-shrink:0; }
li { margin-bottom: var(--human-spacing-half); }
footer { flex-shrink:0; margin-top:auto; width:100%; text-align:center; }
.hello-status { font-size:var(--human-text-base); margin:var(--human-spacing-2) 0; overflow-wrap:anywhere; }
.failed { color:var(--human-danger); }
button { -webkit-app-region:no-drag; font-size:var(--human-text-xs); border:0; padding:var(--human-spacing-half) var(--human-spacing-1); background:transparent; color:var(--human-accent); cursor:pointer; }
.pulse { animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .4; } }
</style>
