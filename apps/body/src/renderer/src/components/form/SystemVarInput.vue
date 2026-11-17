<script setup lang="ts">
import { ref, watch, inject, onMounted } from 'vue'
import type { IpcProxy } from '@renderer/plugin/ipc'

const ipc = inject<IpcProxy>('ipc')!

const props = defineProps<{
  modelValue: Record<string, string>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, string>): void
  (e: 'change', value: Record<string, string>): void
}>()

// 系统变量键列表
const systemKeys = ref<string[]>([])
const hiddenKeys = ref<string[]>([])
const localValues = ref<Record<string, string>>({})
const isEditing = ref<Record<string, boolean>>({})

// 新增变量的输入
const newVarKey = ref('')
const newVarValue = ref('')
const newVarIsHidden = ref(false)

// 加载系统变量键列表
const loadSystemVarKeys = async () => {
  const result = await ipc.config.getSystemVarKeys()
  if (result.success) {
    systemKeys.value = result.data.keys
    hiddenKeys.value = result.data.hiddenKeys
    await loadSystemVarValues()
  }
}

// 加载系统变量值
const loadSystemVarValues = async () => {
  if (systemKeys.value.length === 0) return

  const result = await ipc.config.getSystemVarValues(systemKeys.value)
  if (result.success) {
    localValues.value = { ...result.data }
    emit('update:modelValue', localValues.value)
  }
}

// 保存系统变量
const saveSystemVars = async () => {
  // 过滤掉空值
  const filteredValues = Object.fromEntries(
    Object.entries(localValues.value).filter(([, value]) => value.trim() !== '')
  )

  const result = await ipc.config.setSystemVarValues(
    filteredValues,
    systemKeys.value,
    hiddenKeys.value
  )

  if (result.success) {
    // 重新加载以获取最新的掩码值
    await loadSystemVarValues()
  }
}

// 添加新变量
const addNewVar = () => {
  if (!newVarKey.value.trim()) return

  if (!systemKeys.value.includes(newVarKey.value)) {
    systemKeys.value.push(newVarKey.value)
  }

  if (newVarIsHidden.value && !hiddenKeys.value.includes(newVarKey.value)) {
    hiddenKeys.value.push(newVarKey.value)
  }

  localValues.value[newVarKey.value] = newVarValue.value

  // 清空输入
  newVarKey.value = ''
  newVarValue.value = ''
  newVarIsHidden.value = false
}

// 删除变量
const removeVar = (key: string) => {
  systemKeys.value = systemKeys.value.filter((k) => k !== key)
  hiddenKeys.value = hiddenKeys.value.filter((k) => k !== key)
  delete localValues.value[key]
  delete isEditing.value[key]
}

// 切换隐藏状态
const toggleHidden = (key: string) => {
  if (hiddenKeys.value.includes(key)) {
    hiddenKeys.value = hiddenKeys.value.filter((k) => k !== key)
  } else {
    hiddenKeys.value.push(key)
  }
}

// 检查是否为隐藏字段
const isHidden = (key: string) => {
  return hiddenKeys.value.includes(key)
}

onMounted(() => {
  loadSystemVarKeys()
})

// 监听外部值变化
watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue && Object.keys(newValue).length > 0) {
      localValues.value = { ...newValue }
    }
  },
  { immediate: true }
)

// 发出变化事件
watch(
  localValues,
  (newValue) => {
    emit('change', newValue)
  },
  { deep: true }
)
</script>

<template>
  <div class="system-var-input">
    <div class="header">
      <h4>系统环境变量管理</h4>
      <Button label="保存所有变量" severity="success" @click="saveSystemVars" />
    </div>

    <!-- 现有变量列表 -->
    <div class="var-list">
      <div v-for="key in systemKeys" :key="key" class="var-item">
        <div class="var-key">
          <span>{{ key }}</span>
          <div class="key-actions">
            <Button
              :icon="isHidden(key) ? 'pi pi-eye-slash' : 'pi pi-eye'"
              :severity="isHidden(key) ? 'warning' : 'secondary'"
              text
              size="small"
              :title="isHidden(key) ? '显示值' : '隐藏值'"
              @click="toggleHidden(key)"
            />
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              size="small"
              title="删除变量"
              @click="removeVar(key)"
            />
          </div>
        </div>

        <div class="var-value">
          <InputText
            v-model="localValues[key]"
            :placeholder="isHidden(key) ? '***敏感信息***' : '请输入值'"
            :type="isHidden(key) && !isEditing[key] ? 'password' : 'text'"
            class="flex-1"
            @focus="isEditing[key] = true"
            @blur="isEditing[key] = false"
          />
          <span v-if="isHidden(key)" class="hidden-indicator">🔒</span>
        </div>
      </div>
    </div>

    <!-- 添加新变量 -->
    <div class="add-new-var">
      <Divider />
      <h5>添加新变量</h5>
      <div class="new-var-form">
        <div class="form-row">
          <InputText v-model="newVarKey" placeholder="变量名（如：API_KEY）" class="flex-1" />
          <InputText v-model="newVarValue" placeholder="变量值" class="flex-1" />
        </div>
        <div class="form-row">
          <div class="checkbox-container">
            <Checkbox v-model="newVarIsHidden" input-id="isHidden" binary />
            <label for="isHidden">隐藏显示</label>
          </div>
          <Button
            label="添加变量"
            icon="pi pi-plus"
            :disabled="!newVarKey.trim()"
            @click="addNewVar"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.system-var-input {
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    h4 {
      margin: 0;
      color: var(--text-color);
    }
  }

  .var-list {
    .var-item {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px;
      border: 1px solid var(--surface-border);
      border-radius: 6px;
      margin-bottom: 12px;
      background: var(--surface-section);

      .var-key {
        display: flex;
        justify-content: space-between;
        align-items: center;

        span {
          font-weight: 500;
          color: var(--text-color-secondary);
        }

        .key-actions {
          display: flex;
          gap: 4px;
        }
      }

      .var-value {
        display: flex;
        align-items: center;
        gap: 8px;

        .hidden-indicator {
          color: var(--orange-500);
          font-size: 12px;
        }
      }
    }
  }

  .add-new-var {
    margin-top: 24px;

    h5 {
      margin: 16px 0 12px 0;
      color: var(--text-color);
    }

    .new-var-form {
      .form-row {
        display: flex;
        gap: 12px;
        margin-bottom: 12px;
        align-items: center;

        .checkbox-container {
          display: flex;
          align-items: center;
          gap: 8px;

          label {
            color: var(--text-color-secondary);
            font-size: 14px;
          }
        }
      }
    }
  }
}

:deep(.p-inputtext) {
  width: 100%;
}
</style>
