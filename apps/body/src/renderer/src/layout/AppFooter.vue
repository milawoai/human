<script setup>
import { useLayout } from '@renderer/layout/composables/layout'

const { logo } = useLayout()
</script>

<template>
  <div class="layout-footer mt-auto">
    <div class="footer-start">
      <img :src="logo" alt="logo" />
      <span class="app-name">Verona</span>
    </div>
    <div class="footer-right">
      <span>© Your Organization</span>
    </div>
  </div>
</template>
