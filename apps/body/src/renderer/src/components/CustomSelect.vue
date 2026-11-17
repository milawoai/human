<script setup lang="ts">
import { computed } from 'vue'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import Button from 'primevue/button'

interface Props {
  modelValue?: any
  options: any[]
  optionTranFunc?: (option: any) => { label: string; value: any }
  isAdd?: boolean
  addCallback?: () => void
  isDelete?: boolean
  deleteCallback?: (value: any) => void
  placeholder?: string
  disabled?: boolean
  multiple?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  options: () => [],
  optionTranFunc: (option: any) => ({
    label: option?.toString() || '',
    value: option
  }),
  isAdd: false,
  isDelete: false,
  placeholder: '请选择',
  disabled: false,
  multiple: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void
}>()

// 转换后的选项数据
const transformedOptions = computed(() => {
  return props.options.map((option) => props.optionTranFunc!(option))
})

// 删除由选项模板中的按钮回调触发
</script>

<template>
  <div class="custom-select-container">
    <div class="select-wrapper">
      <template v-if="multiple">
        <MultiSelect
          :model-value="modelValue"
          :options="transformedOptions"
          :placeholder="placeholder"
          :disabled="disabled"
          option-label="label"
          option-value="value"
          display="chip"
          class="w-full"
          @update:model-value="(val) => emit('update:modelValue', val)"
        >
          <!-- 自定义选项模板 -->
          <template #option="slotProps">
            <div class="flex items-center w-full">
              <span class="flex-1">{{ slotProps.option.label }}</span>
              <Button
                v-if="isDelete"
                icon="pi pi-trash"
                severity="danger"
                text
                size="small"
                class="delete-btn"
                @click.stop="deleteCallback?.(slotProps.option.value)"
              />
            </div>
          </template>

          <!-- 添加按钮 -->
          <template v-if="isAdd" #footer>
            <div class="p-2">
              <Button
                label="添加"
                icon="pi pi-plus"
                severity="secondary"
                text
                class="w-full"
                @click="addCallback"
              />
            </div>
          </template>
        </MultiSelect>
      </template>
      <template v-else>
        <Select
          :model-value="modelValue"
          :options="transformedOptions"
          :placeholder="placeholder"
          :disabled="disabled"
          option-label="label"
          option-value="value"
          class="w-full"
          @update:model-value="(val) => emit('update:modelValue', val)"
        >
          <!-- 自定义选项模板 -->
          <template #option="slotProps">
            <div class="flex items-center w-full">
              <span class="flex-1">{{ slotProps.option.label }}</span>
              <Button
                v-if="isDelete"
                icon="pi pi-trash"
                severity="danger"
                text
                size="small"
                class="delete-btn"
                @click.stop="deleteCallback?.(slotProps.option.value)"
              />
            </div>
          </template>

          <!-- 添加按钮 -->
          <template v-if="isAdd" #footer>
            <div class="p-2">
              <Button
                label="添加"
                icon="pi pi-plus"
                severity="secondary"
                text
                class="w-full"
                @click="addCallback"
              />
            </div>
          </template>
        </Select>
      </template>
    </div>
  </div>
</template>

<style scoped lang="less">
.custom-select-container {
  width: 100%;

  .select-wrapper {
    width: 100%;

    :deep(.p-select-option-content),
    :deep(.p-multiselect-item) {
      width: 100%;

      .option-item {
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        width: 100%;
        &:hover {
          .delete-btn {
            opacity: 1;
          }
        }

        > span:first-child {
          flex: 1;
          min-width: 0;
        }

        .delete-btn {
          opacity: 0;
          transition: opacity 0.2s;
          padding: 0.25rem;
          margin-left: auto;

          .p-button-icon {
            font-size: 0.875rem;
          }
        }
      }
    }
  }
}
</style>
