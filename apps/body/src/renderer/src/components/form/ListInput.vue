<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: any[]
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: any[]): void
  (e: 'change', value: any[]): void
}>()

// 用于编辑的数据结构
const items = ref<Array<{ value: any; id: number }>>([])
let nextId = 1

// 初始化和同步数据
const initItems = () => {
  items.value = (props.modelValue || []).map((value) => ({
    value,
    id: nextId++
  }))
}

// 监听外部值变化
watch(
  () => props.modelValue,
  (newValue) => {
    // 避免不必要的重新初始化，只有在真正需要时才重新创建
    const currentValues = items.value.map((item) => item.value).filter((value) => value !== '')
    const newValues = (newValue || []).filter((value) => value !== '') // 也过滤新值中的空值

    // 比较数组内容是否真的不同
    const isDifferent = JSON.stringify(currentValues.sort()) !== JSON.stringify(newValues.sort()) // 排序后比较，避免顺序问题

    if (isDifferent) {
      initItems()
    }
  },
  { immediate: true }
)

// 添加新行
const handleAdd = () => {
  items.value.push({
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
  const result = items.value.map((item) => item.value).filter((value) => value !== '')
  emit('update:modelValue', result)
  emit('change', result)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- 现有值列表 -->
    <div v-for="item in items" :key="item.id" class="flex items-center gap-2">
      <InputText
        v-model="item.value"
        :placeholder="props.placeholder || '请输入值'"
        class="flex-1"
        @update:model-value="updateModelValue"
      />
      <Button icon="pi pi-trash" severity="danger" text @click="handleDelete(item.id)" />
    </div>

    <!-- 添加按钮 -->
    <div class="flex justify-start mt-2">
      <Button label="添加项" icon="pi pi-plus" severity="secondary" text @click="handleAdd" />
    </div>
  </div>
</template>
