<script setup lang="ts">
import type { IpcProxy } from '@renderer/plugin/ipc'
import { inject, onMounted, ref, watch } from 'vue'
const ipc = inject<IpcProxy>('ipc')!
const emit = defineEmits(['update'])
const folderPath = ref('')
const props = defineProps({
  label: {
    type: String,
    required: true
  },
  folderKey: {
    type: String,
    required: true
  },
  defaultPath: {
    type: String,
    default: ''
  },
  basePath: {
    type: String,
    default: ''
  },
  isFileSelection: {
    type: Boolean,
    default: false // 如果为 true 则选择文件，否则选择文件夹
  },
  fileTypes: {
    type: Array as () => Array<{ name: string; extensions: string[] }>,
    default: () => [] // 用于指定文件类型的过滤器
  }
})

const selectFolder = async () => {
  const method = props.isFileSelection ? 'selectFile' : 'selectFolder'
  const options = props.isFileSelection ? { filters: props.fileTypes } : {}
  if (props.basePath) {
    options['defaultPath'] = props.basePath
  }
  const { success, data: filePath } = await ipc.file[method](options)
  if (success) {
    if (folderPath.value.trim() === filePath.trim()) {
      return
    }
    folderPath.value = filePath || ''
    await ipc.common.setStore(props.folderKey, filePath)
  }
}

const openPath = async () => {
  try {
    if (!folderPath.value) {
      return
    }
    const res = await ipc.file.openFolder(folderPath.value)
    console.log('res', res)
  } catch (error) {
    console.error(error)
  }
}

async function queryFolder() {
  const { success, data: path } = await ipc.common.setStore(props.folderKey)
  if (success) {
    folderPath.value = path || ''
  }
  return
}

const onClear = async () => {
  await ipc.common.deleteStore(props.folderKey)
  folderPath.value = ''
  return
}

onMounted(() => {
  queryFolder()
})

watch(folderPath, (newPath, oldPath) => {
  if (newPath === oldPath) {
    return
  }
  emit('update', { key: props.folderKey, path: newPath })
})
watch(
  () => props.defaultPath,
  (newPath, oldPath) => {
    if (newPath === oldPath) {
      return
    }
    folderPath.value = newPath
  }
)
</script>

<template>
  <div class="flex items-center w-full gap-2">
    <span class="line-title">{{ label }}</span>
    <InputGroup class="flex-1">
      <InputText v-model="folderPath" class="line-input" placeholder="请选择路径" />
      <InputGroupAddon>
        <Button icon="pi pi-times" severity="secondary" @click="onClear" />
      </InputGroupAddon>
    </InputGroup>
    <Button class="p-button-sm" severity="primary" @click="selectFolder">选择</Button>
    <Button class="p-button-sm" severity="secondary" @click="openPath">打开</Button>
    <slot></slot>
  </div>
</template>

<style scoped lang="less">
.line {
  &-title {
    font-size: 1rem;
    color: var(--text-color);
    margin: 0;
    padding: 0;
    width: 6rem;
    font-weight: 500;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &-input {
    font-size: 1rem;
    color: var(--text-color);
  }
}
</style>
