<script setup>
import { useI18n } from '@renderer/composables/useI18n'
import { computed } from 'vue'
import AppMenuItem from './AppMenuItem.vue'

const { t } = useI18n()

const model = computed(() => [
  {
    label: t('app.menu.projects'),
    icon: 'pi pi-home',
    to: '/'
  },
  {
    label: t('app.menu.config'),
    icon: 'pi pi-cog',
    to: '/pet-settings'
  }
])
</script>

<template>
  <ul class="layout-menu">
    <template v-for="(item, i) in model" :key="item">
      <AppMenuItem :item="item" root :index="i" />

      <li class="menu-separator"></li>
    </template>
  </ul>
</template>

<style lang="scss" scoped></style>
