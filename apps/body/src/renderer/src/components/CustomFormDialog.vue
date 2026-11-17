<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import CustomForm from './CustomForm.vue'
import type { FormConfig } from '@shared/types/render'

const props = defineProps<{
  visible: boolean
  title?: string
  config: FormConfig
  modelValue?: Record<string, any>
  width?: string
  closeOnSubmit?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'update:modelValue', value: Record<string, any>): void
  (e: 'submit', value: Record<string, any>): void
  (e: 'cancel'): void
  (e: 'change', key: string, value: any): void
}>()

const modelVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

const formData = ref<Record<string, any>>({})

// 初始化表单数据
const initFormData = () => {
  const data: Record<string, any> = {}
  if (props.config?.fields) {
    props.config.fields.forEach((field) => {
      data[field.key] = field.value || ''
    })
  }
  formData.value = data
}

// 监听配置变化
watch(
  () => props.config,
  () => {
    initFormData()
  },
  { immediate: true, deep: true }
)

// 监听外部传入的数据变化
watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal && Object.keys(newVal).length > 0) {
      formData.value = { ...formData.value, ...newVal }
    }
  },
  { immediate: true, deep: true }
)

const handleFormChange = (key: string, value: any) => {
  // 更新内部数据
  formData.value[key] = value
  // 向外部传递变化事件
  emit('change', key, value)
  // 如果使用了 v-model，同步更新外部数据
  if (props.modelValue !== undefined) {
    emit('update:modelValue', { ...formData.value })
  }
}

const handleSubmit = () => {
  emit('submit', formData.value)
  if (props.closeOnSubmit !== false) {
    emit('update:visible', false)
  }
}

const handleCancel = () => {
  emit('cancel')
  emit('update:visible', false)
}

const handleClose = () => {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    v-model:visible="modelVisible"
    :modal="true"
    :header="title || '表单配置'"
    :style="{ width: width || '600px' }"
    @hide="handleClose"
  >
    <div class="p-fluid">
      <CustomForm :config="config" @change="handleFormChange" @submit="handleSubmit">
        <template #footer>
          <!-- 自定义footer，只包含提交和取消按钮 -->
          <div class="flex justify-end gap-2 mt-4">
            <Button
              label="取消"
              icon="pi pi-times"
              severity="secondary"
              class="hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors duration-200"
              @click="handleCancel"
            />
            <Button
              label="提交"
              icon="pi pi-check"
              class="bg-primary-500 hover:bg-primary-600 border-primary-500 hover:border-primary-600 text-white transition-colors duration-200"
              @click="handleSubmit"
            />
          </div>
        </template>
      </CustomForm>
      <slot name="extra" :form-data="formData"></slot>
    </div>
  </Dialog>
</template>

<style scoped>
:deep(.p-dialog-content) {
  overflow: visible;
  background-color: var(--p-content-background);
  color: var(--p-text-color);
}

:deep(.p-dialog-header) {
  background-color: var(--p-content-background);
  color: var(--p-text-color);
  border-bottom: 1px solid var(--p-content-border-color);
}

:deep(.p-dialog-title) {
  color: var(--p-text-color);
}

:deep(.p-dialog-header-close-button) {
  color: var(--p-text-muted-color);
}

:deep(.p-dialog-header-close-button:hover) {
  background-color: var(--p-highlight-background);
  color: var(--p-highlight-color);
}

:deep(.p-fluid) {
  width: 100%;
}

:deep(.p-dialog) {
  background-color: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
}
</style>
