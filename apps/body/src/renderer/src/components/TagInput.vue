<script setup lang="ts">
import { OptionTag } from '@shared/types/project'
import { computed, nextTick, ref } from 'vue'

interface Props {
  modelValue?: OptionTag[]
  availableTags?: OptionTag[]
  placeholder?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => [],
  availableTags: () => [],
  placeholder: '输入标签名称...',
  disabled: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: OptionTag[]): void
}>()

const inputValue = ref('')
const showDropdown = ref(false)
const inputRef = ref<HTMLInputElement>()

// 已选择的标签
const selectedTags = computed(() => {
  return props.modelValue || []
})

// 过滤后的可用标签（排除已选择的）
const filteredTags = computed(() => {
  if (!inputValue.value.trim()) return []

  const searchTerm = inputValue.value.toLowerCase()
  const selectedTagNames = props.modelValue.map((tag) => tag.name.toLowerCase())

  return props.availableTags
    .filter(
      (tag) =>
        !selectedTagNames.includes(tag.name.toLowerCase()) &&
        tag.name.toLowerCase().includes(searchTerm)
    )
    .slice(0, 10) // 最多显示10个建议
})

// 输入框聚焦时显示下拉列表
const handleInputFocus = () => {
  if (!props.disabled) {
    showDropdown.value = true
  }
}

// 输入框失焦时延迟隐藏下拉列表（为了支持点击选择）
const handleInputBlur = () => {
  setTimeout(() => {
    showDropdown.value = false
  }, 200)
}

// 输入内容变化
const handleInputChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  inputValue.value = target.value
  showDropdown.value = target.value.trim().length > 0 && !props.disabled
}

// 选择现有标签
const selectTag = (tag: OptionTag) => {
  const newValue = [...props.modelValue, tag]
  emit('update:modelValue', newValue)
  inputValue.value = ''
  showDropdown.value = false
  nextTick(() => {
    inputRef.value?.focus()
  })
}

// 回车创建新标签
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && inputValue.value.trim()) {
    event.preventDefault()
    const trimmedValue = inputValue.value.trim()

    // 检查是否已选择相同名称的标签
    const alreadySelected = props.modelValue.some(
      (tag) => tag.name.toLowerCase() === trimmedValue.toLowerCase()
    )

    if (alreadySelected) {
      inputValue.value = ''
      showDropdown.value = false
      return
    }

    // 检查是否已存在相同名称的可用标签
    const existingTag = props.availableTags.find(
      (tag) => tag.name.toLowerCase() === trimmedValue.toLowerCase()
    )

    if (existingTag) {
      // 如果标签已存在，直接选择它
      selectTag(existingTag)
    } else {
      // 如果标签不存在，创建新标签（没有id）
      const newTag: OptionTag = { name: trimmedValue }
      const newValue = [...props.modelValue, newTag]
      emit('update:modelValue', newValue)
      inputValue.value = ''
      showDropdown.value = false
      nextTick(() => {
        inputRef.value?.focus()
      })
    }
  } else if (event.key === 'Escape') {
    showDropdown.value = false
    inputRef.value?.blur()
  }
}

// 删除已选择的标签
const removeTag = (tag: OptionTag) => {
  const newValue = props.modelValue.filter((t) => !(t.name === tag.name && t.id === tag.id))
  emit('update:modelValue', newValue)
}

// 点击输入区域聚焦到输入框
const focusInput = () => {
  if (!props.disabled) {
    inputRef.value?.focus()
  }
}
</script>

<template>
  <div class="tag-input-container">
    <!-- 已选择的标签和输入框 -->
    <div
      class="tag-input-wrapper"
      :class="{ disabled: disabled, focused: showDropdown }"
      @click="focusInput"
    >
      <!-- 已选择的标签 -->
      <div class="selected-tags">
        <span v-for="(tag, index) in selectedTags" :key="tag.id || `new-${index}`" class="tag-chip">
          {{ tag.name }}
          <i class="pi pi-times tag-remove" @click.stop="removeTag(tag)"></i>
        </span>
      </div>

      <!-- 输入框 -->
      <input
        ref="inputRef"
        v-model="inputValue"
        type="text"
        :placeholder="selectedTags.length === 0 ? placeholder : ''"
        :disabled="disabled"
        class="tag-input"
        @input="handleInputChange"
        @focus="handleInputFocus"
        @blur="handleInputBlur"
        @keydown="handleKeydown"
      />
    </div>

    <!-- 下拉建议列表 -->
    <div v-if="showDropdown && filteredTags.length > 0" class="dropdown">
      <div v-for="tag in filteredTags" :key="tag.id" class="dropdown-item" @click="selectTag(tag)">
        {{ tag.name }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.tag-input-container {
  position: relative;
  width: 100%;
}

.tag-input-wrapper {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-height: 40px;
  padding: 6px 12px;
  border: 1px solid var(--p-inputtext-border-color);
  border-radius: var(--p-border-radius);
  background: var(--p-inputtext-background);
  cursor: text;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.tag-input-wrapper:hover {
  border-color: var(--p-inputtext-hover-border-color);
}

.tag-input-wrapper.focused {
  border-color: var(--p-inputtext-focus-border-color);
  box-shadow: var(--p-inputtext-focus-ring);
}

.tag-input-wrapper.disabled {
  background: var(--p-inputtext-disabled-background);
  cursor: not-allowed;
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
  border-radius: 12px;
  font-size: 0.875rem;
  white-space: nowrap;
}

.tag-remove {
  font-size: 0.75rem;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.tag-remove:hover {
  opacity: 1;
}

.tag-input {
  flex: 1;
  min-width: 120px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 1rem;
  color: var(--p-inputtext-color);
}

.tag-input:disabled {
  cursor: not-allowed;
}

.tag-input::placeholder {
  color: var(--p-inputtext-placeholder-color);
}

.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 1000;
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius);
  box-shadow: var(--p-overlay-shadow);
  max-height: 200px;
  overflow-y: auto;
}

.dropdown-item {
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid var(--p-content-border-color);
}

.dropdown-item:last-child {
  border-bottom: none;
}

.dropdown-item:hover {
  background: var(--p-highlight-background);
  color: var(--p-highlight-text-color);
}

.dropdown-item.create-new {
  color: var(--p-primary-color);
  font-style: italic;
}

.mr-2 {
  margin-right: 0.5rem;
}
</style>
