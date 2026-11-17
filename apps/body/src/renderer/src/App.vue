<template>
  <ConfirmDialog>
    <template #message="slotProps">
      <div class="custom-dialog-content">
        <pre class="custom-dialog-message">{{ formatMessage(slotProps.message) }}</pre>
      </div>
    </template>
  </ConfirmDialog>
  <router-view></router-view>
</template>

<script setup>
import ConfirmDialog from 'primevue/confirmdialog'

const formatMessage = ({ message }) => {
  try {
    return message.replace(/\\n/g, '\n')
  } catch (error) {
    console.error(error)
  }
}
</script>

<style lang="less">
html,
body,
#app {
  padding: 0;
  margin: 0;
  width: 100%;
  height: 100%;
}
.custom-dialog-content {
  min-width: 50vw;
  max-height: calc(50vh - 8.5rem);
  overflow-y: auto;

  .custom-dialog-message {
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
    padding-right: 8px;
  }

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 4px;

    &:hover {
      background: #555;
    }
  }
}
</style>
