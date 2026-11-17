<script setup lang="ts">
import { useGlobalUI } from '@renderer/composables/useGlobalUI'

const { isGlobalLoading, loadingText } = useGlobalUI()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isGlobalLoading"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Loading"
    >
      <div
        class="bg-surface-0 dark:bg-surface-900 rounded-lg p-6 shadow-xl border border-surface-200 dark:border-surface-700 min-w-[200px] text-center"
      >
        <div class="flex flex-col items-center space-y-4">
          <!-- Loading Spinner -->
          <div class="relative">
            <div
              class="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"
            ></div>
          </div>

          <!-- Loading Text -->
          <p class="text-surface-700 dark:text-surface-200 font-medium">
            {{ loadingText }}
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
