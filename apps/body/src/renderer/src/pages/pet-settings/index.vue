<script setup lang="ts">
import BackendLifecyclePanel from '@renderer/components/BackendLifecyclePanel.vue'
import ThemeSettings from '@renderer/components/ThemeSettings.vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import { inject, onMounted, ref, computed } from 'vue'
import type { IpcProxy } from '@renderer/plugin/ipc'
import type { Live2DPetModelConfig } from '@shared/live2dPetModels'
import { defaultPetSettings, type PetSettings } from '@shared/petSettings'
import { defaultHearingSettings, type HearingSettings } from '@shared/hearingSettings'
import { createEmptyWorkspaceCatalog, type JobWorkspaceCatalog } from '@shared/jobWorkspaceCatalog'
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
const activeTab = ref<'general' | 'lifecycle' | 'interfaces' | 'hearing' | 'workspaces'>('general')
const serverInterfaces = ref<ServerInterfaces | null>(null)
const live2dPetModels = ref<Live2DPetModelConfig[]>([])
const jobWorkspaceCatalog = ref<JobWorkspaceCatalog>(createEmptyWorkspaceCatalog())
const workspaceBusy = ref(false)
const workspaceLoading = ref(false)

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

const loadJobWorkspaces = async () => {
  workspaceLoading.value = true
  try {
    const result = await ipc.jobWorkspaces.getSettings()
    if (result.success && result.data) jobWorkspaceCatalog.value = result.data as JobWorkspaceCatalog
    else statusText.value = result.msg || '读取 Job 工作区失败'
  } finally { workspaceLoading.value = false }
}

const addJobWorkspace = async () => {
  workspaceBusy.value = true
  statusText.value = ''
  try {
    const result = await ipc.jobWorkspaces.addDirectory()
    if (!result.success || !result.data) {
      statusText.value = result.msg || '添加工作区失败'
      return
    }
    const data = result.data as { catalog: JobWorkspaceCatalog; outcome: 'added' | 'duplicate' | 'cancelled' | 'denied' }
    jobWorkspaceCatalog.value = data.catalog
    statusText.value = ({ added: '工作区已授权并添加', duplicate: '该目录已在授权列表中',
      cancelled: '已取消选择', denied: '未授予目录访问权限' })[data.outcome]
  } finally { workspaceBusy.value = false }
}

const setJobWorkspaceDefault = async (id: string) => {
  workspaceBusy.value = true
  statusText.value = ''
  try {
    const result = await ipc.jobWorkspaces.setDefault(id)
    if (result.success && result.data) {
      jobWorkspaceCatalog.value = result.data as JobWorkspaceCatalog
      statusText.value = '默认工作区已更新'
    } else statusText.value = result.msg || '更新默认工作区失败'
  } finally { workspaceBusy.value = false }
}

const revokeJobWorkspace = async (id: string) => {
  workspaceBusy.value = true
  statusText.value = ''
  try {
    const result = await ipc.jobWorkspaces.revoke(id)
    if (result.success && result.data) {
      const data = result.data as { catalog: JobWorkspaceCatalog; revoked: boolean }
      jobWorkspaceCatalog.value = data.catalog
      statusText.value = data.revoked ? '工作区授权已撤销' : '已保留工作区授权'
    } else statusText.value = result.msg || '撤销工作区授权失败'
  } finally { workspaceBusy.value = false }
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
    loadAsrModels(),
    loadJobWorkspaces()
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
        :class="{ active: activeTab === 'general' }"
        type="button"
        @click="activeTab = 'general'"
      >
        通用配置
      </button>
      <button
        class="tab-button"
        :class="{ active: activeTab === 'lifecycle' }"
        type="button"
        @click="activeTab = 'lifecycle'"
      >
        服务检测
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
      <button
        class="tab-button"
        :class="{ active: activeTab === 'workspaces' }"
        type="button"
        @click="activeTab = 'workspaces'"
      >
        Job 工作区
      </button>
    </nav>

    <!-- 通用配置 Tab：主题 + 模型 + 启动选项 -->
    <template v-if="activeTab === 'general'">
      <ThemeSettings />

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

    <!-- 服务检测 Tab -->
    <BackendLifecyclePanel v-else-if="activeTab === 'lifecycle'" />

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

    <section v-else-if="activeTab === 'workspaces'" class="settings-section">
      <div class="workspace-heading">
        <div class="section-title">
          <h2>Job 工作区</h2>
          <p>选择后台任务默认使用的目录。每个目录都要单独授权；Job 只能在授权目录内读取和创建或更新文件。</p>
        </div>
        <Button label="添加工作区" icon="pi pi-folder-open" :disabled="workspaceBusy" @click="addJobWorkspace" />
      </div>

      <p v-if="workspaceLoading" class="workspace-empty" role="status">正在读取已授权目录…</p>
      <p v-else-if="jobWorkspaceCatalog.workspaces.length === 0" class="workspace-empty" role="status">
        还没有授权目录。添加一个常用文件夹后，新 Job 会默认在其中工作。
      </p>
      <div v-else class="workspace-list" aria-label="已授权 Job 工作区">
        <div v-for="workspace in jobWorkspaceCatalog.workspaces" :key="workspace.id" class="workspace-row">
          <div class="workspace-details">
            <div class="workspace-name">
              <strong>{{ workspace.label }}</strong>
              <Tag v-if="workspace.id === jobWorkspaceCatalog.defaultWorkspaceId" value="默认" severity="success" />
            </div>
            <code class="workspace-path">{{ workspace.path }}</code>
            <p class="workspace-reference">单个 Job 使用此目录时填写：<code>{{ workspace.id }}</code></p>
          </div>
          <div class="workspace-actions">
            <Button v-if="workspace.id !== jobWorkspaceCatalog.defaultWorkspaceId" label="设为默认" severity="secondary"
              :disabled="workspaceBusy" @click="setJobWorkspaceDefault(workspace.id)" />
            <Button label="撤销授权" severity="danger" outlined :disabled="workspaceBusy"
              @click="revokeJobWorkspace(workspace.id)" />
          </div>
        </div>
      </div>
      <p class="workspace-note">Job 不会因为收到请求中的任意路径而自动获得访问权限。移除目录后，后续提交不能再使用该授权。</p>
    </section>

    <p v-if="statusText" class="status-text">{{ statusText }}</p>
  </main>
</template>

<style scoped>
.pet-settings-page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--human-space-section);
  min-height: 100%;
  background: var(--human-bg);
  padding: var(--human-space-page);
  color:var(--human-text);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--human-spacing-4);
  margin-bottom: 0;
}

.eyebrow {
  margin: 0 0 var(--human-spacing-1);
  color:var(--human-text-muted);
  font-size:var(--human-text-sm);
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size:var(--human-text-title);
  font-weight: 700;
}

h2 {
  font-size:var(--human-text-xl);
  font-weight: 700;
}

.settings-section {
  margin-bottom: 0;
  padding: var(--human-space-card);
  border:1px solid var(--human-border);
  border-radius: var(--human-radius-md);
  background:var(--human-surface);
}

.tab-nav {
  margin-bottom: 0;
  display: flex;
  gap: var(--human-spacing-2);
}

.tab-button {
  padding: var(--human-space-control-y) var(--human-space-control-x);
  border:1px solid var(--human-border);
  border-radius: var(--human-radius-control);
  background:var(--human-surface);
  color:var(--human-text);
  cursor: pointer;
}

.tab-button.active {
  border-color:var(--human-accent);
  color:var(--human-accent);
}

.section-title {
  margin-bottom: var(--human-spacing-4);
}

.section-title p {
  margin-top: var(--human-spacing-1);
  color:var(--human-text-muted);
  font-size:var(--human-text-base);
}

.workspace-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--human-space-related);
}

.workspace-list {
  display: flex;
  flex-direction: column;
  gap: var(--human-space-related);
}

.workspace-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--human-space-section);
  min-width: 0;
  padding: var(--human-space-panel);
  border: 1px solid var(--human-border);
  border-radius: var(--human-radius-card);
  background: var(--human-surface-raised);
}

.workspace-details {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--human-space-related);
  min-width: 0;
}

.workspace-name,
.workspace-actions {
  display: flex;
  align-items: center;
  gap: var(--human-space-related);
}

.workspace-path {
  overflow-wrap: anywhere;
  color: var(--human-text-muted);
  font-family: var(--human-font-mono);
  font-size: var(--human-text-sm);
}

.workspace-reference {
  color: var(--human-text-muted);
  font-size: var(--human-text-sm);
  overflow-wrap: anywhere;
}

.workspace-reference code {
  color: var(--human-text);
  font-family: var(--human-font-mono);
}

.workspace-empty,
.workspace-note {
  color: var(--human-text-muted);
  font-size: var(--human-text-base);
}

.workspace-empty {
  padding: var(--human-space-panel);
  border: 1px dashed var(--human-border);
  border-radius: var(--human-radius-card);
}

.workspace-note {
  margin-top: var(--human-space-related);
}

@media (max-width: 760px) {
  .workspace-heading,
  .workspace-row {
    align-items: stretch;
    flex-direction: column;
  }

  .workspace-actions {
    flex-wrap: wrap;
  }
}

.model-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--human-spacing-2);
  margin-bottom: var(--human-spacing-4);
}

.model-item {
  padding: var(--human-spacing-3);
  display: flex;
  flex-direction: column;
  gap: var(--human-spacing-1);
  border:1px solid var(--human-border);
  border-radius: var(--human-radius-md);
  background:var(--human-bg);
  color:var(--human-text);
  text-align: left;
  cursor: pointer;
}

.model-item.active {
  border-color:var(--human-accent);
}

.model-item span {
  font-weight: 700;
}

.model-item small,
.switch-row small {
  color:var(--human-text-muted);
}

.field-row,
.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--human-spacing-4);
}

.field-row > span {
  font-weight: 700;
}

.switch-row + .switch-row {
  margin-top: var(--human-spacing-4);
  padding-top: var(--human-spacing-4);
  border-top:1px solid var(--human-border);
}

.switch-row > span {
  display: flex;
  flex-direction: column;
  gap: var(--human-spacing-1);
}

.status-text {
  color:var(--human-accent);
  font-size:var(--human-text-base);
}

.interface-summary {
  margin-bottom: var(--human-spacing-4);
  display: flex;
  flex-wrap: wrap;
  gap: var(--human-spacing-2);
  color:var(--human-text-muted);
  font-size:var(--human-text-base);
}

.interface-group + .interface-group {
  margin-top: var(--human-spacing-4);
}

.interface-group h3 {
  margin: 0 0 var(--human-spacing-2);
  font-size:var(--human-text-md);
  font-weight: 700;
}

.interface-route {
  padding: var(--human-spacing-3);
  border:1px solid var(--human-border);
  border-radius: var(--human-radius-md);
  background:var(--human-bg);
}

.interface-route + .interface-route {
  margin-top: var(--human-spacing-2);
}

.route-header {
  margin-bottom: var(--human-spacing-2);
  display: flex;
  align-items: center;
  gap: var(--human-spacing-2);
}

.method {
  padding: var(--human-spacing-half) var(--human-spacing-2);
  border-radius: var(--human-radius-sm);
  background:var(--human-accent);
  color:var(--human-on-accent);
}

.path {
  color:var(--human-text);
}

.interface-route p {
  margin-bottom: var(--human-spacing-2);
}

.interface-route small {
  display: block;
  color:var(--human-text-muted);
}

/* ── Hearing Settings Tab ── */

.model-select-wrapper {
  display: flex;
  align-items: center;
  gap: var(--human-spacing-3);
  flex-wrap: wrap;
}

.section-label {
  font-weight: 700;
  font-size:var(--human-text-base);
  white-space: nowrap;
}

.model-select {
  min-width: 240px;
}

.model-info {
  display: flex;
  align-items: center;
  gap: var(--human-spacing-2);
}

.model-name {
  font-size:var(--human-text-base);
  color:var(--human-text-muted);
}

.loading-hint,
.hint-text {
  color:var(--human-text-muted);
  font-size:var(--human-text-base);
}
</style>
