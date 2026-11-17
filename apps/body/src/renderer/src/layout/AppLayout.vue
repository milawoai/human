<!--
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-31 17:12:41
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2025-05-26 11:59:01
 * @FilePath: /copy_code_desk_vue/src/renderer/src/layout/AppLayout.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
<script setup>
import { useLayout } from '@renderer/layout/composables/layout'
import { computed, onBeforeUnmount, watch, ref } from 'vue'
import AppBreadcrumb from './AppBreadcrumb.vue'
import AppConfig from './AppConfig.vue'
// import AppFooter from './AppFooter.vue'
import AppSidebar from './AppSidebar.vue'
import AppTopbar from './AppTopbar.vue'
import GlobalLoading from '@renderer/components/GlobalLoading.vue'
import CustomToast from '@renderer/components/CustomToast.vue'
import { useCustomToast } from '@renderer/composables/useCustomToast'

const { layoutConfig, layoutState, isSidebarActive } = useLayout()
const { toasts, removeToast } = useCustomToast()

const outsideClickListener = ref(null)

function bindOutsideClickListener() {
  if (!outsideClickListener.value) {
    outsideClickListener.value = (event) => {
      if (isOutsideClicked(event)) {
        layoutState.overlayMenuActive = false
        layoutState.overlaySubmenuActive = false
        layoutState.staticMenuMobileActive = false
        layoutState.menuHoverActive = false
        layoutState.configSidebarVisible = false
      }
    }
    document.addEventListener('click', outsideClickListener.value)
  }
}

function unbindOutsideClickListener() {
  if (outsideClickListener.value) {
    document.removeEventListener('click', outsideClickListener.value)
    outsideClickListener.value = null
  }
}

function isOutsideClicked(event) {
  const sidebarEl = document.querySelector('.layout-sidebar')
  const topbarEl = document.querySelector('.topbar-menubutton')

  return !(
    sidebarEl.isSameNode(event.target) ||
    sidebarEl.contains(event.target) ||
    topbarEl.isSameNode(event.target) ||
    topbarEl.contains(event.target)
  )
}

watch(isSidebarActive, (newVal) => {
  if (newVal) {
    bindOutsideClickListener()
  } else {
    unbindOutsideClickListener()
  }
})

onBeforeUnmount(() => {
  unbindOutsideClickListener()
})

const containerClass = computed(() => {
  return [
    {
      'layout-light': layoutConfig.layoutTheme === 'colorScheme' && !layoutConfig.darkTheme,
      'layout-dark': layoutConfig.layoutTheme === 'colorScheme' && layoutConfig.darkTheme,
      'layout-primary': !layoutConfig.darkTheme && layoutConfig.layoutTheme === 'primaryColor',
      'layout-slim': layoutConfig.menuMode === 'slim',
      'layout-slim-plus': layoutConfig.menuMode === 'slim-plus',
      'layout-static': layoutConfig.menuMode === 'static',
      'layout-overlay': layoutConfig.menuMode === 'overlay',
      'layout-overlay-active': layoutState.overlayMenuActive,
      'layout-mobile-active': layoutState.staticMenuMobileActive,
      'layout-static-inactive':
        layoutState.staticMenuDesktopInactive && layoutConfig.menuMode === 'static'
    }
  ]
})
</script>

<template>
  <div class="layout-container" :class="containerClass">
    <AppTopbar></AppTopbar>
    <AppSidebar></AppSidebar>
    <div class="layout-content-wrapper">
      <div class="layout-content">
        <div class="layout-content-inner">
          <AppBreadcrumb></AppBreadcrumb>
          <router-view></router-view>
          <!-- <AppFooter></AppFooter> -->
        </div>
      </div>
    </div>
    <Toast />
    <GlobalLoading />
    <CustomToast :toasts="toasts" @remove="removeToast" />
    <AppConfig></AppConfig>
  </div>
</template>

<style lang="scss"></style>
