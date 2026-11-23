<script setup lang="ts">
/**
 * 模型配置面板（human-48b 可视化模型配置；自 /config 独立页面迁入设置页 tab）
 *
 * 档案 → 模型两级管理：查看默认、一键切换、连通测试、通道新模型对比、Ollama 探测。
 * 密钥不经过本组件（全部能力走 backend 代理）。
 */
import { computed, inject, onMounted, ref } from 'vue'
import type { IpcProxy } from '@renderer/plugin/ipc'

// 经应用插件注入的 IPC 代理
const ipc = inject<IpcProxy>('ipc')!

interface ProfileItem {
  name: string
  model?: string
  models?: string[]
  defaultModel?: string
  baseUrl?: string
  apiKeyEnv?: string
}

type TestState = 'unknown' | 'testing' | 'ok' | 'fail'

const profiles = ref<ProfileItem[]>([])
const defaultProfile = ref('')
const selected = ref('')
const testState = ref<Record<string, TestState>>({})
const testMessage = ref<Record<string, string>>({})
const remoteModels = ref<Record<string, string[]>>({})
const ollamaUrl = ref('http://127.0.0.1:11434')
const ollamaState = ref<{ ok: boolean; models: string[]; error?: string } | null>(null)
const ollamaLoading = ref(false)
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

const showToast = (msg: string) => {
  toast.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 3200)
}

const selectedProfile = computed(
  () => profiles.value.find((p) => p.name === selected.value) ?? null
)
const isDefault = (name: string) => name === defaultProfile.value

const localModels = (p: ProfileItem): string[] => {
  if (Array.isArray(p.models) && p.models.length > 0) return p.models
  return p.model ? [p.model] : []
}

const newRemoteModels = (p: ProfileItem): string[] => {
  const remote = remoteModels.value[p.name]
  if (!remote) return []
  const local = new Set(localModels(p))
  return remote.filter((m) => !local.has(m))
}

const loadProfiles = async () => {
  try {
    const result = await ipc.modelConfig.list()
    const data = result?.data ?? {}
    profiles.value = Array.isArray(data.profiles) ? data.profiles : []
    defaultProfile.value = typeof data.defaultProfile === 'string' ? data.defaultProfile : ''
    if (!selected.value || !profiles.value.some((p) => p.name === selected.value)) {
      selected.value = defaultProfile.value || profiles.value[0]?.name || ''
    }
  } catch (error) {
    showToast(`加载档案失败: ${(error as Error).message}`)
  }
}

const testProfile = async (p: ProfileItem) => {
  testState.value = { ...testState.value, [p.name]: 'testing' }
  try {
    const result = await ipc.modelConfig.remoteModels({ profile: p.name })
    if (result?.success) {
      const models: string[] = result.data?.models ?? []
      remoteModels.value = { ...remoteModels.value, [p.name]: models }
      testState.value = { ...testState.value, [p.name]: 'ok' }
      testMessage.value = { ...testMessage.value, [p.name]: `连通正常 · 通道 ${models.length} 个模型` }
    } else {
      testState.value = { ...testState.value, [p.name]: 'fail' }
      testMessage.value = { ...testMessage.value, [p.name]: result?.msg || '连通失败' }
    }
  } catch (error) {
    testState.value = { ...testState.value, [p.name]: 'fail' }
    testMessage.value = { ...testMessage.value, [p.name]: (error as Error).message }
  }
}

const switchProfile = async (p: ProfileItem) => {
  try {
    const result = await ipc.modelConfig.switchModel({ profile: p.name })
    if (result?.success) {
      defaultProfile.value = p.name
      showToast(`默认档案已切换：${p.name} → ${result.data?.model ?? ''}，下轮对话生效`)
    } else {
      showToast(result?.msg || '切换失败')
    }
  } catch (error) {
    showToast(`切换失败: ${(error as Error).message}`)
  }
}

const switchModel = async (p: ProfileItem, model: string) => {
  try {
    const result = await ipc.modelConfig.switchModel({ profile: p.name, model })
    if (result?.success) {
      if (p.name === defaultProfile.value) {
        // 同档案内换默认模型：刷新本地视图
        await loadProfiles()
      }
      showToast(`已切换到 ${model}${p.name === defaultProfile.value ? '，下轮对话生效' : ''}`)
    } else {
      showToast(result?.msg || '切换失败')
    }
  } catch (error) {
    showToast(`切换失败: ${(error as Error).message}`)
  }
}

const probeOllama = async () => {
  ollamaLoading.value = true
  ollamaState.value = null
  try {
    const result = await ipc.modelConfig.probe({ baseUrl: ollamaUrl.value })
    const data = result?.data ?? {}
    ollamaState.value = { ok: Boolean(data.ok), models: data.models ?? [], error: data.error }
  } catch (error) {
    ollamaState.value = { ok: false, models: [], error: (error as Error).message }
  } finally {
    ollamaLoading.value = false
  }
}

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    showToast(`已复制 ${text}`)
  } catch {
    showToast('复制失败')
  }
}

const dotClass = (name: string) => {
  const s = testState.value[name] ?? 'unknown'
  return { unknown: s === 'unknown', testing: s === 'testing', ok: s === 'ok', fail: s === 'fail' }
}

onMounted(() => {
  void loadProfiles()
})
</script>

<template>
  <section class="model-config-panel" aria-label="模型配置">
    <div class="panel-actions">
      <button class="btn ghost small" @click="loadProfiles">刷新</button>
    </div>

    <div class="layout">
      <!-- 左：档案列表 -->
      <aside class="profile-list">
        <div
          v-for="p in profiles"
          :key="p.name"
          class="profile-item"
          :class="{ active: p.name === selected }"
          @click="selected = p.name"
        >
          <span class="dot" :class="dotClass(p.name)" />
          <span class="profile-name">{{ p.name }}</span>
          <span v-if="isDefault(p.name)" class="star" title="默认档案">★</span>
        </div>
        <button class="add-provider" disabled title="v1.x 支持，敬请期待">+ 添加供应商</button>
      </aside>

      <!-- 右：档案详情 -->
      <section v-if="selectedProfile" class="detail">
        <div class="detail-header">
          <div>
            <h2>
              {{ selectedProfile.name }}
              <span v-if="isDefault(selectedProfile.name)" class="badge default">默认档案</span>
            </h2>
            <p class="meta">
              {{ selectedProfile.baseUrl || '（内置通道，无自定义 baseUrl）' }}
              <span v-if="selectedProfile.apiKeyEnv"> · 密钥 {{ selectedProfile.apiKeyEnv }}</span>
            </p>
          </div>
          <div class="detail-actions">
            <button
              v-if="selectedProfile.baseUrl"
              class="btn"
              :disabled="testState[selectedProfile.name] === 'testing'"
              @click="testProfile(selectedProfile)"
            >
              {{ testState[selectedProfile.name] === 'testing' ? '测试中…' : '测试连通' }}
            </button>
            <button v-if="!isDefault(selectedProfile.name)" class="btn primary" @click="switchProfile(selectedProfile)">
              设为默认档案
            </button>
          </div>
        </div>

        <p v-if="testMessage[selectedProfile.name]" class="test-msg" :class="testState[selectedProfile.name]">
          {{ testMessage[selectedProfile.name] }}
        </p>

        <table class="model-table">
          <thead>
            <tr><th>模型</th><th>状态</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="m in localModels(selectedProfile)" :key="m">
              <td class="mono">{{ m }}</td>
              <td>
                <span v-if="m === selectedProfile.model" class="badge default">⭐ 默认</span>
                <span v-else class="badge">可切换</span>
              </td>
              <td>
                <button
                  v-if="m !== selectedProfile.model"
                  class="btn small"
                  @click="switchModel(selectedProfile, m)"
                >
                  设为默认
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <details v-if="selectedProfile.baseUrl && remoteModels[selectedProfile.name]" class="remote-box">
          <summary>通道新模型（{{ newRemoteModels(selectedProfile).length }}）</summary>
          <p v-if="newRemoteModels(selectedProfile).length === 0" class="meta">本地配置已覆盖通道全部模型 ✓</p>
          <div v-for="m in newRemoteModels(selectedProfile)" :key="m" class="remote-row">
            <span class="mono">{{ m }}</span>
            <span class="badge">未配置</span>
            <button class="btn small ghost" @click="copyText(m)">复制</button>
          </div>
          <p class="meta">一键添加将在后续版本支持；当前可复制后加入 profiles.json 的 models 列表</p>
        </details>
        <p v-else-if="!selectedProfile.baseUrl" class="meta">该档案为内置通道，不支持通道清单对比。</p>
      </section>
    </div>

    <!-- Ollama 本地探测 -->
    <section class="ollama-card">
      <h3>本地 Ollama</h3>
      <div class="ollama-row">
        <input v-model="ollamaUrl" class="text-input" spellcheck="false" />
        <button class="btn" :disabled="ollamaLoading" @click="probeOllama">
          {{ ollamaLoading ? '探测中…' : '探测' }}
        </button>
      </div>
      <p v-if="ollamaState?.ok" class="test-msg ok">
        已连通（{{ ollamaState.models.length }} 个本地模型）：{{ ollamaState.models.join('、') }}
      </p>
      <p v-else-if="ollamaState" class="test-msg fail">
        未连通{{ ollamaState.error ? `（${ollamaState.error}）` : '' }}。请确认 Ollama 已启动（`ollama serve`）。
      </p>
      <p class="meta">本地模型一键建档将在后续版本支持。</p>
    </section>

    <Transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </Transition>
  </section>
</template>

<style scoped>
.model-config-panel {
  display: flex;
  flex-direction: column;
  font-family:var(--human-font-body);
  color:var(--human-text);
  gap: var(--human-space-section);
}
.panel-actions { display: flex; justify-content: flex-end; }
.layout {
  display: flex;
  gap: var(--human-spacing-4);
  min-height: 0;
}
.profile-list {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--human-spacing-1);
}
.profile-item {
  display: flex;
  align-items: center;
  gap: var(--human-spacing-2);
  padding: var(--human-spacing-2) var(--human-spacing-3);
  border-radius: var(--human-radius-md);
  cursor: pointer;
  background:var(--human-surface);
}
.profile-item.active { background:var(--human-surface); outline:1px solid var(--human-accent); }
.profile-name { flex: 1; }
.star { color:var(--human-warning); }
.dot { width:8px; height:8px; border-radius:var(--human-radius-pill); background:var(--human-surface-raised); }
.dot.ok { background:var(--human-success); }
.dot.fail { background:var(--human-danger); }
.dot.testing { background:var(--human-warning); animation:pulse 1s infinite; }
@keyframes pulse { 50% { opacity: 0.35; } }
.add-provider {
  margin-top: var(--human-spacing-2);
  padding: var(--human-spacing-2);
  border-radius: var(--human-radius-md);
  border:1px dashed var(--human-border);
  background: transparent;
  color:var(--human-text-subtle);
  cursor: not-allowed;
}
.detail {
  flex: 1;
  background:var(--human-surface);
  border-radius: var(--human-radius-md);
  padding: var(--human-space-card);
  display: flex;
  flex-direction: column;
  gap: var(--human-spacing-3);
  min-width: 0;
}
.detail-header { display: flex; justify-content: space-between; gap: var(--human-spacing-3); align-items: flex-start; }
.detail-header h2 { margin:0 0 var(--human-spacing-1); font-size:var(--human-text-lg); display:flex; gap:var(--human-spacing-2); align-items:center; }
.meta { color:var(--human-text-subtle); font-size:var(--human-text-sm); margin:var(--human-spacing-half) 0; word-break:break-all; }
.detail-actions { display: flex; gap: var(--human-spacing-2); flex-shrink: 0; }
.badge {
  font-size:var(--human-text-xs);
  padding: var(--human-spacing-half) var(--human-spacing-2);
  border-radius: var(--human-radius-md);
  background:var(--human-surface);
  color:var(--human-text-muted);
}
.badge.default { background:var(--human-accent-soft); color:var(--human-accent); }
.test-msg { font-size:var(--human-text-sm); margin:0; padding:var(--human-spacing-2) var(--human-spacing-2); border-radius: var(--human-radius-sm); }
.test-msg.ok { background:var(--human-success-soft); color:var(--human-success); }
.test-msg.fail { background:var(--human-danger-soft); color:var(--human-danger); }
.model-table { width:100%; border-collapse:collapse; font-size:var(--human-text-base); }
.model-table th, .model-table td { text-align:left; padding:var(--human-spacing-2) var(--human-spacing-2); border-bottom:1px solid var(--human-border); }
.mono { font-family:var(--human-font-mono); }
.remote-box { font-size:var(--human-text-base); }
.remote-box summary { cursor:pointer; color:var(--human-accent); }
.remote-row { display: flex; align-items: center; gap: var(--human-spacing-2); padding: var(--human-spacing-1) 0; }
.ollama-card {
  background:var(--human-surface);
  border-radius: var(--human-radius-md);
  padding: var(--human-spacing-3) var(--human-spacing-4);
}
.ollama-card h3 { margin:0 0 var(--human-spacing-2); font-size:var(--human-text-base); }
.ollama-row { display: flex; gap: var(--human-spacing-2); }
.text-input {
  flex: 1;
  max-width: 420px;
  background:var(--human-input);
  border:1px solid var(--human-border);
  border-radius: var(--human-radius-sm);
  padding: var(--human-spacing-2) var(--human-spacing-2);
  color: inherit;
  font-family:var(--human-font-mono);
  font-size:var(--human-text-sm);
}
.btn {
  border:1px solid var(--human-border);
  background:var(--human-surface);
  color: inherit;
  border-radius: var(--human-radius-sm);
  padding: var(--human-spacing-1) var(--human-spacing-3);
  cursor: pointer;
  font-size:var(--human-text-base);
}
.btn:hover { background:var(--human-surface-raised); }
.btn.primary { background:var(--human-accent-strong); border-color:var(--human-accent); color:var(--human-on-accent); }
.btn.small { padding:var(--human-spacing-half) var(--human-spacing-2); font-size:var(--human-text-sm); }
.btn.ghost { background: transparent; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background:var(--human-surface);
  border:1px solid var(--human-border);
  padding: var(--human-spacing-2) var(--human-spacing-4);
  border-radius: var(--human-radius-md);
  font-size:var(--human-text-base);
  box-shadow:var(--human-shadow);
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
@media (max-width: 760px) {
  .layout { flex-direction: column; flex: none; }
  .profile-list { width: auto; }
  .detail-header { flex-wrap: wrap; gap: var(--human-space-related); }
}
</style>
