<script setup lang="ts">
// import { inject } from 'vue'
// import type { IpcProxy } from '@renderer/plugin/ipc'
import type { FormConfig } from '@shared/types/render'
import { onMounted, ref, watch } from 'vue'
import CustomSelect from './CustomSelect.vue'
import GenerateConfig from './form/GenerateConfig.vue'
import ListInput from './form/ListInput.vue'
import ObjectInput from './form/ObjectInput.vue'
import SelectFolderLine from './SelectFolderLine.vue'
import TagInput from './TagInput.vue'

// const ipc = inject<IpcProxy>('ipc')!

const props = defineProps<{
  config: FormConfig
  modelValue?: Record<string, any>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, any>): void
  (e: 'submit', value: Record<string, any>): void
  (e: 'change', key: string, value: any): void
}>()

const formData = ref<Record<string, any>>({})
const errors = ref<Record<string, string>>({})

const initFormData = () => {
  const data: Record<string, any> = {}
  if (props.config?.fields) {
    props.config.fields.forEach((field) => {
      data[field.key] = field.value !== undefined ? field.value : ''
    })
  }
  formData.value = data
  // 清空错误信息
  errors.value = {}
}

// 监听配置变化，重新初始化表单数据
watch(
  () => props.config,
  () => {
    initFormData()
  },
  { immediate: true, deep: true }
)

// 如果有外部传入的 modelValue，优先使用外部数据
watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal && Object.keys(newVal).length > 0) {
      formData.value = { ...formData.value, ...newVal }
    }
  },
  { immediate: true, deep: true }
)

// 验证单个字段
const validateField = (field: any, value: any): string => {
  if (!field.rules) return ''
  for (const rule of field.rules) {
    if (rule.required && (!value || value === '')) {
      return rule.message || `${field.renderLabel}是必填项`
    }
  }
  return ''
}

// 验证所有字段
const validateForm = (): boolean => {
  const newErrors: Record<string, string> = {}
  let isValid = true
  if (props.config?.fields) {
    props.config.fields.forEach((field) => {
      const error = validateField(field, formData.value[field.key])
      if (error) {
        newErrors[field.key] = error
        isValid = false
      }
    })
  }
  errors.value = newErrors
  return isValid
}

const handleFieldChange = (key: string, value: any) => {
  formData.value[key] = value
  // 清除该字段的错误信息
  if (errors.value[key]) {
    delete errors.value[key]
  }
  emit('change', key, value)
  // 如果使用了 v-model，同步更新外部数据
  if (props.modelValue !== undefined) {
    emit('update:modelValue', { ...formData.value })
  }
}

const handleSubmit = () => {
  if (validateForm()) {
    console.log('handleSubmit: ', formData.value)
    emit('submit', formData.value)
  }
}

onMounted(() => {
  if (props.config) {
    initFormData()
  }
})
</script>

<template>
  <div class="flex items-center flex-col w-full">
    <form v-if="config" class="config-form w-full" @submit.prevent="handleSubmit">
      <div
        v-for="field in config.fields"
        :key="field.key"
        class="field mb-4"
        :class="{
          'field-horizontal': config.layout === 'horizontal',
          'field-vertical': config.layout === 'vertical' || !config.layout
        }"
      >
        <label :for="field.key" class="field-label" :style="{ width: config.labelWidth || 'auto' }">
          {{ field.renderLabel }}
        </label>

        <div class="field-content">
          <!-- Input Text -->
          <InputText
            v-if="field.renderType === 'input'"
            :id="field.key"
            v-model="formData[field.key]"
            v-bind="field.renderParams"
            :class="{ 'p-invalid': errors[field.key] }"
            @update:model-value="handleFieldChange(field.key, $event)"
          />

          <!-- Password -->
          <Password
            v-else-if="field.renderType === 'password'"
            :id="field.key"
            v-model="formData[field.key]"
            v-bind="field.renderParams"
            :class="{ 'p-invalid': errors[field.key] }"
            @update:model-value="handleFieldChange(field.key, $event)"
          />

          <!-- Textarea -->
          <Textarea
            v-else-if="field.renderType === 'textarea'"
            :id="field.key"
            v-model="formData[field.key]"
            v-bind="field.renderParams"
            :class="{ 'p-invalid': errors[field.key] }"
            @update:model-value="handleFieldChange(field.key, $event)"
          />

          <!-- Select -->
          <Select
            v-else-if="field.renderType === 'select'"
            :id="field.key"
            v-model="formData[field.key]"
            :options="field.options"
            option-label="label"
            option-value="value"
            v-bind="field.renderParams"
            :class="{ 'p-invalid': errors[field.key] }"
            @update:model-value="handleFieldChange(field.key, $event)"
          />

          <!-- Checkbox -->
          <Checkbox
            v-else-if="field.renderType === 'checkbox'"
            :id="field.key"
            v-model="formData[field.key]"
            :binary="true"
            v-bind="field.renderParams"
            @update:model-value="handleFieldChange(field.key, $event)"
          />

          <!-- Number Input -->
          <InputNumber
            v-else-if="field.renderType === 'number'"
            :id="field.key"
            v-model="formData[field.key]"
            v-bind="field.renderParams"
            :class="{ 'p-invalid': errors[field.key] }"
            @update:model-value="handleFieldChange(field.key, $event)"
          />

          <!-- Toggle Switch -->
          <ToggleSwitch
            v-else-if="field.renderType === 'switch'"
            :id="field.key"
            v-model="formData[field.key]"
            v-bind="field.renderParams"
            @update:model-value="handleFieldChange(field.key, $event)"
          />

          <!-- Date Picker -->
          <DatePicker
            v-else-if="field.renderType === 'date'"
            :id="field.key"
            v-model="formData[field.key]"
            v-bind="field.renderParams"
            :class="{ 'p-invalid': errors[field.key] }"
            @update:model-value="handleFieldChange(field.key, $event)"
          />

          <!-- Radio Button Group -->
          <div v-else-if="field.renderType === 'radio'" class="flex gap-3">
            <div v-for="option in field.options" :key="option.value" class="flex items-center">
              <RadioButton
                :id="`${field.key}_${option.value}`"
                v-model="formData[field.key]"
                :value="option.value"
                :name="field.key"
                @update:model-value="handleFieldChange(field.key, $event)"
              />
              <label :for="`${field.key}_${option.value}`" class="ml-2">
                {{ option.label }}
              </label>
            </div>
          </div>

          <!-- Object Input -->
          <ObjectInput
            v-else-if="field.renderType === 'object'"
            :id="field.key"
            v-model="formData[field.key]"
            :placeholder="field.renderParams?.placeholder"
            @update:model-value="handleFieldChange(field.key, $event)"
          />

          <!-- List Input -->
          <ListInput
            v-else-if="field.renderType === 'list'"
            :id="field.key"
            v-model="formData[field.key]"
            :placeholder="field.renderParams?.placeholder"
            @update:model-value="handleFieldChange(field.key, $event)"
          />

          <!-- Generate Config -->
          <GenerateConfig
            v-else-if="field.renderType === 'generateConfig'"
            :model-value="formData[field.key]"
            :desc="field.renderLabel"
            :field-key="field.key"
            @update:model-value="handleFieldChange(field.key, $event)"
          />

          <!-- Custom Select -->
          <CustomSelect
            v-else-if="field.renderType === 'customSelect'"
            :id="field.key"
            v-model="formData[field.key]"
            :options="field.renderParams?.options || []"
            :option-tran-func="field.renderParams?.optionTranFunc"
            :multiple="field.renderParams?.multiple || false"
            :placeholder="field.renderParams?.placeholder"
            :disabled="field.renderParams?.disabled || false"
            :class="{ 'p-invalid': errors[field.key] }"
            @update:model-value="handleFieldChange(field.key, $event)"
          />

          <!-- Tag Input -->
          <TagInput
            v-else-if="field.renderType === 'tagInput'"
            :id="field.key"
            v-model="formData[field.key]"
            :available-tags="field.renderParams?.availableTags || []"
            :placeholder="field.renderParams?.placeholder"
            :disabled="field.renderParams?.disabled || false"
            :class="{ 'p-invalid': errors[field.key] }"
            @update:model-value="handleFieldChange(field.key, $event)"
            @create-tag="field.renderParams?.onCreateTag"
          />

          <!-- Folder Path Selector -->
          <SelectFolderLine
            v-else-if="field.renderType === 'folderPath'"
            :label="field.renderLabel"
            :folder-key="field.key"
            :default-path="formData[field.key]"
          />

          <!-- Default to Input Text -->
          <InputText
            v-else
            :id="field.key"
            v-model="formData[field.key]"
            v-bind="field.renderParams"
            :class="{ 'p-invalid': errors[field.key] }"
            @update:model-value="handleFieldChange(field.key, $event)"
          />
          <!-- Error Message -->
          <small v-if="errors[field.key]" class="p-error mt-1 block">
            {{ errors[field.key] }}
          </small>
        </div>
      </div>

      <slot name="extra-form" :form-data="formData"></slot>

      <slot name="footer" :form-data="formData" :handle-submit="handleSubmit">
        <div class="flex justify-end gap-2 mt-4">
          <Button
            type="submit"
            label="提交"
            icon="pi pi-check"
            class="bg-primary-500 hover:bg-primary-600 border-primary-500 hover:border-primary-600 text-white transition-colors duration-200"
          />
        </div>
      </slot>
    </form>
  </div>
</template>

<style scoped lang="less">
.config-form {
  width: 100%;
}

.field {
  width: 100%;
}

.field-vertical {
  display: flex;
  flex-direction: column;
}

.field-vertical .field-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--p-text-color);
}

.field-vertical .field-content {
  width: 100%;
}

.field-horizontal {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.field-horizontal .field-label {
  flex-shrink: 0;
  font-weight: 500;
  color: var(--p-text-color);
}

.field-horizontal .field-content {
  flex: 1;
}

:deep(.p-inputtext),
:deep(.p-password),
:deep(.p-textarea),
:deep(.p-select),
:deep(.p-inputnumber) {
  width: 100%;
}

.p-error {
  color: var(--p-red-500);
  font-size: 0.875rem;
}

.mt-1 {
  margin-top: 0.25rem;
}

.block {
  display: block;
}
</style>
