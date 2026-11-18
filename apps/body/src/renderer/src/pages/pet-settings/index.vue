<script setup lang="ts">
import BackendLifecyclePanel from '@renderer/components/BackendLifecyclePanel.vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import { inject, onMounted, ref, computed } from 'vue'
import type { IpcProxy } from '@renderer/plugin/ipc'
import type { Live2DPetModelConfig } from '@shared/live2dPetModels'
import { defaultPetSettings, type PetSettings } from '@shared/petSettings'
import { defaultHearingSettings, type HearingSettings } from '@shared/hearingSettings'
import SelectFolderLine from '@renderer/components/SelectFolderLine.vue'

const ipc = inject<IpcProxy>('ipc')!

interface ServerInterfaceRoute {
  method: string
  path: string
  description: string
  requestBody: string | null
  response: string
}

interface ServerInterfaceGroup {
  id: string
  name: string
  routes: ServerInterfaceRoute[]
}

interface ServerInterfaces {
  version: number
  updatedAt: string
  baseUrl: string
  groups: ServerInterfaceGroup[]
}

const settings = ref<PetSettings>({ ...defaultPetSettings })
const hearingSettings = ref<HearingSettings>({ ...defaultHearingSettings })
const serverPort = ref<number>(0)
const serverEnabled = ref(false)
const saving = ref(false)
const hearingSaving = ref(false)
const serverLoading = ref(false)
const statusText = ref('')
const activeTab = ref<'settings' | 'interfaces' | 'hearing'>('settings')
const serverInterfaces = ref<ServerInterfaces | null>(null)
const live2dPetModels = ref<Live2DPetModelConfig[]>([])

const modelOptions = ref<{ label: string; value: string }[]>([])

// ──────────────────────────────────────────────
// ASR 模型列表
// ──────────────────────────────────────────────

interface AsrModelOption {
  label: string
  value: string
}

const asrModelOptions = ref<AsrModelOption[]>([])
const asrModelsLoading = ref(false)

const selectedAsrModel = computed(() => {
  return asrModelOptions.value.find(m => m.value === hearingSettings.value.selectedAsrModelId)
})

const loadAsrModels = async () => {
  asrModelsLoading.value = true
  try {
    const result = await ipc.sense.listAsrModels()
    if (result.success && result.data) {
      // result.data 结构: { success: true, data: { "python-asr": { transcribers: { ... } } } }
      const outerData = result.data?.data || result.data
      const options: AsrModelOption[] = []
      // 遍历所有 provider 的 transcribers
      for (const provider of Object.values(outerData || {})) {
        const p = provider as any
        if (p?.transcribers) {
          for (const transcriber of Object.values(p.transcribers)) {
            const t = transcriber as any
            if (t?.models && Array.isArray(t.models)) {
              for (const model of t.models) {
                options.push({
                  label: `${t.label} — ${model.label}`,
                  value: model.value
                })
              }
            }
          }
        }
      }
      asrModelOptions.value = options
    }
  } catch (error) {
    console.error('加载 ASR 模型列表失败:', error)
  } finally {
    asrModelsLoading.value = false
  }
}

// ──────────────────────────────────────────────
// Pet Settings 加载/保存
// ──────────────────────────────────────────────

const loadSettings = async () => {
  const result = await ipc.config.getPetSettings()
  if (result.success && result.data) {
    settings.value = {
      ...defaultPetSettings,
      ...result.data
    }
  }
}

const loadLive2DModels = async () => {
  const result = await ipc.live2d.getPetModels()
  if (result.success && result.data?.models) {
    live2dPetModels.value = result.data.models
    modelOptions.value = result.data.models.map((model) => ({
      label: model.name,
      value: model.id
    }))
  }
}

const loadServerStatus = async () => {
  const portResult = await ipc.server.getServerPort()
  if (portResult.success) {
    serverPort.value = portResult.data
  }

  const statusResult = await ipc.server.checkServerStatus()
  if (statusResult.success) {
    serverEnabled.value = Boolean(statusResult.data?.isAlive)
  }
}

const loadServerInterfaces = async () => {
  const result = await ipc.server.getServerInterfaces()
  if (result.success && result.data) {
    serverInterfaces.value = result.data
  }
}

const saveSettings = async (patch: Partial<PetSettings>) => {
  saving.value = true
  statusText.value = ''

  try {
    const result = await ipc.config.savePetSettings(patch)
    if (result.success && result.data) {
      settings.value = result.data
      statusText.value = '已保存'
    } else {
      statusText.value = result.msg || '保存失败'
    }
  } finally {
    saving.value = false
  }
}

const updateSelectedModel = async (modelId: string) => {
  await saveSettings({ selectedModelId: modelId })
}

const updateOpenLive2DOnStart = async (enabled: boolean) => {
  await saveSettings({ openLive2DOnStart: enabled })
}

const updateStartServerOnStart = async (enabled: boolean) => {
  serverLoading.value = true
  await saveSettings({ startServerOnStart: enabled })

  try {
    if (enabled) {
      await ipc.server.startServer()
    } else {
      await ipc.server.stopServer()
    }
    await loadServerStatus()
  } catch (error) {
    console.error('切换本地服务失败:', error)
    statusText.value = '本地服务切换失败'
  } finally {
    serverLoading.value = false
  }
}

// ──────────────────────────────────────────────
// Hearing Settings 加载/保存
// ──────────────────────────────────────────────

const loadHearingSettings = async () => {
  const result = await ipc.config.getHearingSettings()
  if (result.success && result.data) {
    hearingSettings.value = {
      ...defaultHearingSettings,
      ...result.data
    }
  }
}

const saveHearingSettingsPatch = async (patch: Partial<HearingSettings>) => {
  hearingSaving.value = true
  statusText.value = ''
  try {
    const result = await ipc.config.saveHearingSettings(patch)
    if (result.success && result.data) {
      hearingSettings.value = result.data
      statusText.value = '录音配置已保存'
    } else {
      statusText.value = result.msg || '保存失败'
    }
  } finally {
    hearingSaving.value = false
  }
}

const updateAsrModel = async (modelId: string) => {
  await saveHearingSettingsPatch({ selectedAsrModelId: modelId })
}

const onSaveDirUpdate = async (data: { key: string; path: string }) => {
  await saveHearingSettingsPatch({ saveDir: data.path })
}

// ──────────────────────────────────────────────
// 其他
// ──────────────────────────────────────────────

const openLive2DWindow = async () => {
  await ipc.window.closePetWindow()
  await ipc.window.createPetWindow()
}

onMounted(async () => {
  await Promise.all([
    loadLive2DModels(),
    loadSettings(),
    loadServerStatus(),
    loadServerInterfaces(),
    loadHearingSettings(),
    loadAsrModels()
  ])
})
</script>

<template>
  <main class="pet-settings-page">
    <section class="page-header">
      <div>
        <p class="eyebrow">桌面秘书</p>
        <h1>Pet 配置</h1>
      </div>
      <Button label="打开 Live2D" severity="info" @click="openLive2DWindow" />
    </section>

    <nav class="tab-nav" aria-label="Pet settings tabs">
      <button
        class="tab-button"
        :class="{ active: activeTab === 'settings' }"
        type="button"
        @click="activeTab = 'settings'"
      >
        Pet 配置
      </button>
      <button
        class="tab-button"
        :class="{ active: activeTab === 'interfaces' }"
        type="button"
        @click="activeTab = 'interfaces'"
      >
        服务接口
      </button>
      <button
        class="tab-button"
        :class="{ active: activeTab === 'hearing' }"
        type="button"
        @click="activeTab = 'hearing'"
      >
        录音配置
      </button>
    </nav>

    <BackendLifecyclePanel />

    <!-- Pet 配置 Tab -->
    <template v-if="activeTab === 'settings'">
      <section class="settings-section">
        <div class="section-title">
          <h2>模型列表</h2>
          <p>当前先使用本地配置，后续可以改为从本地 server 接口读取。</p>
        </div>

        <div class="model-list">
          <button
            v-for="model in live2dPetModels"
            :key="model.id"
            class="model-item"
            :class="{ active: settings.selectedModelId === model.id }"
            type="button"
            @click="updateSelectedModel(model.id)"
          >
            <span>{{ model.name }}</span>
            <small>{{ model.resourcePath }}</small>
          </button>
        </div>

        <label class="field-row">
          <span>默认模型</span>
          <Select
            :model-value="settings.selectedModelId"
            :options="modelOptions"
            option-label="label"
            option-value="value"
            placeholder="选择模型"
            @update:model-value="updateSelectedModel"
          />
        </label>
      </section>

      <section class="settings-section">
        <div class="section-title">
          <h2>启动选项</h2>
        </div>

        <label class="switch-row">
          <span>
            <strong>开始就打开 Live2D</strong>
            <small>应用启动后自动打开 Pet 窗口。</small>
          </span>
          <ToggleSwitch
            :model-value="settings.openLive2DOnStart"
            :disabled="saving"
            @update:model-value="updateOpenLive2DOnStart"
          />
        </label>

        <label class="switch-row">
          <span>
            <strong>默认启动本地服务</strong>
            <small>当前端口：{{ serverPort || '...' }}，当前状态：{{ serverEnabled ? '运行中' : '未运行' }}</small>
          </span>
          <ToggleSwitch
            :model-value="settings.startServerOnStart"
            :loading="serverLoading"
            :disabled="saving"
            @update:model-value="updateStartServerOnStart"
          />
        </label>
      </section>
    </template>

    <!-- 服务接口 Tab -->
    <section v-else-if="activeTab === 'interfaces'" class="settings-section">
      <div class="section-title">
        <h2>服务接口</h2>
        <p>接口清单来自 main/server 侧 JSON；新增 server 接口后需要同步维护。</p>
      </div>

      <div v-if="serverInterfaces" class="interface-summary">
        <span>Base URL: {{ serverInterfaces.baseUrl.replace('{port}', String(serverPort || '...')) }}</span>
        <span>Version: {{ serverInterfaces.version }}</span>
      </div>

      <template v-if="serverInterfaces">
        <div v-for="group in serverInterfaces.groups" :key="group.id" class="interface-group">
          <h3>{{ group.name }}</h3>
          <div v-for="route in group.routes" :key="`${route.method}-${route.path}`" class="interface-route">
            <div class="route-header">
              <code class="method">{{ route.method }}</code>
              <code class="path">{{ route.path }}</code>
            </div>
            <p>{{ route.description }}</p>
            <small>Request: {{ route.requestBody || '无' }}</small>
            <small>Response: {{ route.response }}</small>
          </div>
        </div>
      </template>
      <p v-else class="status-text">正在读取接口清单...</p>
    </section>

    <!-- 录音配置 Tab -->
    <template v-else-if="activeTab === 'hearing'">
      <section class="settings-section">
        <div class="section-title">
          <h2>ASR 模型</h2>
          <p>选择默认的语音识别模型，开启监听时自动使用。</p>
        </div>

        <div v-if="asrModelsLoading" class="loading-hint">加载模型列表中...</div>
        <template v-else>
          <div class="model-select-wrapper">
            <label class="section-label">选择模型</label>
            <Select
              :model-value="hearingSettings.selectedAsrModelId"
              :options="asrModelOptions"
              option-label="label"
              option-value="value"
              placeholder="选择 ASR 模型"
              class="model-select"
              :disabled="hearingSaving"
              @update:model-value="updateAsrModel"
            />
            <div v-if="selectedAsrModel" class="model-info">
              <Tag value="ASR" severity="info" />
              <span class="model-name">{{ selectedAsrModel.label }}</span>
            </div>
          </div>
          <p v-if="asrModelOptions.length === 0 && !asrModelsLoading" class="hint-text">
            未获取到模型列表，请确保 Python 服务和 Neural Core 正在运行。
          </p>
        </template>
      </section>

      <section class="settings-section">
        <div class="section-title">
          <h2>录音文件</h2>
          <p>设置录音文件的保存目录（可选）。</p>
        </div>

        <SelectFolderLine
          label="保存目录"
          folder-key="hearing_settings.save_dir"
          :disabled="hearingSaving"
          @update="onSaveDirUpdate"
        />
      </section>
    </template>

    <p v-if="statusText" class="status-text">{{ statusText }}</p>
  </main>
</template>

<style scoped>
.pet-settings-page {
  min-height: 100%;
  padding: 28px;
  color: var(--text-color);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0 0 6px;
  color: var(--text-color-secondary);
  font-size: 12px;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size: 28px;
  font-weight: 700;
}

h2 {
  font-size: 18px;
  font-weight: 700;
}

.settings-section {
  margin-bottom: 20px;
  padding: 18px;
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  background: var(--surface-card);
}

.tab-nav {
  margin-bottom: 18px;
  display: flex;
  gap: 8px;
}

.tab-button {
  padding: 8px 14px;
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  background: var(--surface-card);
  color: var(--text-color);
  cursor: pointer;
}

.tab-button.active {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.section-title {
  margin-bottom: 16px;
}

.section-title p {
  margin-top: 6px;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.model-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.model-item {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  background: var(--surface-ground);
  color: var(--text-color);
  text-align: left;
  cursor: pointer;
}

.model-item.active {
  border-color: var(--primary-color);
}

.model-item span {
  font-weight: 700;
}

.model-item small,
.switch-row small {
  color: var(--text-color-secondary);
}

.field-row,
.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.field-row > span {
  font-weight: 700;
}

.switch-row + .switch-row {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--surface-border);
}

.switch-row > span {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.status-text {
  color: var(--primary-color);
  font-size: 13px;
}

.interface-summary {
  margin-bottom: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.interface-group + .interface-group {
  margin-top: 20px;
}

.interface-group h3 {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 700;
}

.interface-route {
  padding: 12px;
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  background: var(--surface-ground);
}

.interface-route + .interface-route {
  margin-top: 10px;
}

.route-header {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.method {
  padding: 3px 7px;
  border-radius: 6px;
  background: var(--primary-color);
  color: var(--primary-color-text);
}

.path {
  color: var(--text-color);
}

.interface-route p {
  margin-bottom: 8px;
}

.interface-route small {
  display: block;
  color: var(--text-color-secondary);
}

/* ── Hearing Settings Tab ── */

.model-select-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.section-label {
  font-weight: 700;
  font-size: 14px;
  white-space: nowrap;
}

.model-select {
  min-width: 240px;
}

.model-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-name {
  font-size: 13px;
  color: var(--text-color-secondary);
}

.loading-hint,
.hint-text {
  color: var(--text-color-secondary);
  font-size: 13px;
}
</style>
