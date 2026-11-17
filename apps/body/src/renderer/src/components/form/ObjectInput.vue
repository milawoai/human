<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: Record<string, any>
  placeholder?: {
    key?: string
    value?: string
  }
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, any>): void
  (e: 'change', value: Record<string, any>): void
}>()

// 用于编辑的数据结构
const items = ref<Array<{ key: string; value: any; id: number }>>([])
let nextId = 1

// 将 modelValue 转换为对象（处理字符串类型）
const parseModelValue = (value: any): Record<string, any> => {
  // 如果是字符串类型，尝试解析为 JSON
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      // 确保解析结果是对象而不是其他类型
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed
      }
    } catch (e) {
      // JSON 解析失败，返回空对象
      console.warn('Failed to parse modelValue as JSON:', value)
    }
    return {}
  }
  // 如果是对象类型，直接返回（包括 null 的情况返回空对象）
  return value || {}
}

// 初始化和同步数据
const initItems = () => {
  const objectValue = parseModelValue(props.modelValue)
  items.value = Object.entries(objectValue).map(([key, value]) => ({
    key,
    value,
    id: nextId++
  }))
}

// 监听外部值变化
watch(
  () => props.modelValue,
  (newValue) => {
    // 避免不必要的重新初始化，只有在真正需要时才重新创建
    const currentObject: Record<string, any> = {}
    items.value.forEach((item) => {
      if (item.key.trim()) {
        currentObject[item.key] = item.value
      }
    })
    const newObject = parseModelValue(newValue)

    // 比较对象内容是否真的不同
    const isDifferent = JSON.stringify(currentObject) !== JSON.stringify(newObject)

    if (isDifferent) {
      initItems()
    }
  },
  { immediate: true }
)

// 添加新行
const handleAdd = () => {
  items.value.push({
    key: '',
    value: '',
    id: nextId++
  })
}

// 删除行
const handleDelete = (id: number) => {
  items.value = items.value.filter((item) => item.id !== id)
  updateModelValue()
}

// 更新值
const updateModelValue = () => {
  const result: Record<string, any> = {}
  items.value.forEach((item) => {
    if (item.key.trim()) {
      result[item.key] = item.value
    }
  })
  emit('update:modelValue', result)
  emit('change', result)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- 现有键值对 -->
    <div v-for="item in items" :key="item.id" class="flex items-center gap-2">
      <InputText
        v-model="item.key"
        :placeholder="props.placeholder?.key || '键名'"
        class="flex-1"
        @update:model-value="updateModelValue"
      />
      <InputText
        v-model="item.value"
        :placeholder="props.placeholder?.value || '值'"
        class="flex-1"
        @update:model-value="updateModelValue"
      />
      <Button icon="pi pi-trash" severity="danger" text @click="handleDelete(item.id)" />
    </div>

    <!-- 添加按钮 -->
    <div class="flex justify-start mt-2">
      <Button label="添加字段" icon="pi pi-plus" severity="secondary" text @click="handleAdd" />
    </div>
  </div>
</template>
