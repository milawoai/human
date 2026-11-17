<template>
  <div class="generate-config-field">
    <div class="flex items-center gap-4">
      <!-- 是否生成复选框 -->
      <div class="flex items-center gap-2 min-w-[120px]">
        <Checkbox
          v-model="localValue.generate"
          :input-id="`generate-${fieldKey}`"
          binary
          @change="handleChange"
        />
        <label :for="`generate-${fieldKey}`" class="text-sm font-medium">
          {{ desc }}
        </label>
      </div>

      <!-- 路径选择部分 -->
      <div class="flex items-center gap-2 flex-1">
        <Button
          icon="pi pi-folder-open"
          severity="secondary"
          outlined
          size="small"
          :disabled="!localValue.generate"
          class="min-w-[150px]"
          @click="selectPath"
        >
          选择路径
        </Button>

        <!-- 路径显示 -->
        <div
          class="flex-1 px-3 py-2 border border-surface-300 rounded-md bg-surface-50 text-sm"
          :class="{ 'opacity-50': !localValue.generate }"
        >
          {{ localValue.path || '未选择路径' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, inject } from 'vue'
import Checkbox from 'primevue/checkbox'
import Button from 'primevue/button'
import type { IpcProxy } from '@renderer/plugin/ipc'

interface GenerateConfigValue {
  generate: boolean
  path: string
}

interface Props {
  modelValue: GenerateConfigValue
  desc: string
  fieldKey: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: GenerateConfigValue]
}>()

const ipc = inject<IpcProxy>('ipc')!
const localValue = ref<GenerateConfigValue>({ ...props.modelValue })

watch(
  () => props.modelValue,
  (newValue) => {
    localValue.value = { ...newValue }
  },
  { deep: true }
)

const handleChange = () => {
  emit('update:modelValue', { ...localValue.value })
}

const selectPath = async () => {
  try {
    // 调用文件服务选择文件夹
    const result = await ipc.file.selectFolder({
      defaultPath: localValue.value.path
    })

    if (result && result.success && result.data) {
      localValue.value.path = result.data
      handleChange()
    }
  } catch (error) {
    console.error('选择路径失败:', error)
  }
}
</script>

<style scoped>
.generate-config-field {
  margin-bottom: 1rem;
}

.generate-config-field:last-child {
  margin-bottom: 0;
}
</style>
