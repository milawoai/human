<script setup lang="ts">
import { ref } from 'vue'
import { currentTheme } from '@renderer/theme'
import { themeDefinitions } from '@shared/theme'
const busy = ref(false), error = ref('')
async function update(event: Event, key: 'id' | 'fontScale') {
  if (busy.value) return
  busy.value = true
  error.value = ''
  const value = (event.target as HTMLSelectElement).value
  try {
    const result = await window.electron.ipcRenderer.invoke('theme-set', {
      id: currentTheme.value.id, fontScale: currentTheme.value.fontScale,
      [key]: key === 'fontScale' ? Number(value) : value
    })
    if (!result.success) error.value = result.msg || '主题保存失败'
  } catch { error.value = '主题保存失败，请重试' }
  finally {
    busy.value = false
    if (error.value) (event.target as HTMLSelectElement).value = String(currentTheme.value[key])
  }
}
</script>
<template>
  <section class="theme-settings" aria-label="外观主题">
    <h2>外观主题</h2>
    <label>主题 <select :value="currentTheme.id" :disabled="busy" @change="update($event, 'id')">
      <option v-for="(theme, id) in themeDefinitions.themes" :key="id" :value="id">{{ theme.label }}</option>
    </select></label>
    <label>文字大小 <select :value="currentTheme.fontScale" :disabled="busy" @change="update($event, 'fontScale')">
      <option :value="1">标准</option><option :value="1.125">较大</option><option :value="1.25">大</option>
    </select></label>
    <p>立即应用到所有窗口，下次启动继续使用。</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.theme-settings { padding: var(--human-space-card); border: 1px solid var(--human-border); border-radius: var(--human-radius-md); background: var(--human-surface); }
h2 { margin: 0 0 var(--human-spacing-3); font-size: var(--human-text-xl); }
label { display: inline-flex; align-items: center; gap: var(--human-spacing-2); margin-right: var(--human-spacing-4); }
select { padding: var(--human-spacing-1) var(--human-spacing-2); border: 1px solid var(--human-border); border-radius: var(--human-radius-sm); background: var(--human-input); color: var(--human-text); }
p { font-size: var(--human-text-sm); color: var(--human-text-muted); margin: var(--human-spacing-2) 0 0; }
[role='alert'] { color: var(--human-danger); }
</style>
