<script setup>
import { useLayout } from '@renderer/layout/composables/layout'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
// 导入图片资源
import logoDark from '@renderer/assets/image/logo-dark.png'
import logoLight from '@renderer/assets/image/logo-light.png'

const { toggleMenu, layoutConfig, tabs, closeTab, isDarkTheme, toggleConfigSidebar } = useLayout()

const searchActive = ref(false)

const router = useRouter()

function activateSearch() {
  searchActive.value = true

  setTimeout(() => {
    const input = document.querySelector('.searchInput')
    input.focus()
  }, 100)
}

function deactivateSearch() {
  searchActive.value = false
}

function onCloseTab(index) {
  if (tabs.value.length > 1) {
    if (index === tabs.value.length - 1) router.push(tabs.value[tabs.value.length - 2].to)
    else router.push(tabs.value[index + 1].to)
  } else {
    router.push('/')
  }
  closeTab(index)
}

const logo = computed(() => {
  // 使用导入的图片资源
  if (layoutConfig.layoutTheme === 'primaryColor' && layoutConfig.theme !== 'yellow') {
    return logoLight
  } else {
    return isDarkTheme.value ? logoLight : logoDark
  }
})
</script>

<template>
  <div class="layout-topbar">
    <router-link to="/" class="app-logo">
      <img alt="app logo" :src="logo" />
      <span class="app-name">Verona</span>
    </router-link>

    <button ref="menubutton" class="topbar-menubutton" type="button" @click="toggleMenu">
      <span></span>
    </button>

    <ul class="topbar-menu">
      <li v-for="(item, i) in tabs" :key="i">
        <router-link :to="item.to" :exact-active-class="'active-route'">
          <span> {{ item.label }}</span>
        </router-link>
        <i class="pi pi-times" @click="onCloseTab(i)"></i>
      </li>
      <!-- <li v-if="!tabs || tabs.length === 0" class="topbar-menu-empty">
        Use (cmd + click) on a menu item to open a tab
      </li> -->
    </ul>

    <div class="topbar-actions">
      <Button
        severity="contrast"
        rounded
        type="button"
        icon="pi pi-palette"
        @click="toggleConfigSidebar"
      />

      <div class="topbar-search" :class="{ 'topbar-search-active': searchActive }">
        <Button
          severity="secondary"
          rounded
          type="button"
          icon="pi pi-search"
          @click="activateSearch"
        />
        <div class="search-input-wrapper">
          <IconField>
            <InputText
              class="searchInput"
              type="text"
              placeholder="Search"
              @blur="deactivateSearch"
              @keydown.escape="deactivateSearch"
            />
            <InputIcon class="pi pi-search" />
          </IconField>
        </div>
      </div>

      <div class="topbar-profile">
        <button
          v-styleclass="{
            selector: '@next',
            enterFromClass: 'hidden',
            enterActiveClass: 'animate-scalein',
            leaveToClass: 'hidden',
            leaveActiveClass: 'animate-fadeout',
            hideOnOutsideClick: true
          }"
          class="topbar-profile-button"
          type="button"
        >
          <img alt="avatar" src="../assets/image/avatar.png" />
          <span class="profile-details">
            <span class="profile-name">Gene Russell</span>
            <span class="profile-job">Developer</span>
          </span>
          <i class="pi pi-angle-down"></i>
        </button>
        <ul
          class="list-none p-4 m-0 rounded-border shadow hidden absolute bg-surface-0 dark:bg-surface-900 origin-top w-full sm:w-48 mt-2 right-0 top-auto"
        >
          <li>
            <a
              class="flex p-2 rounded-border items-center hover:bg-emphasis transition-colors duration-150 cursor-pointer"
            >
              <i class="pi pi-user !mr-4"></i>
              <span class="hidden sm:inline">Profile</span>
            </a>
            <a
              class="flex p-2 rounded-border items-center hover:bg-emphasis transition-colors duration-150 cursor-pointer"
            >
              <i class="pi pi-inbox !mr-4"></i>
              <span class="hidden sm:inline">Inbox</span>
            </a>
            <a
              class="flex p-2 rounded-border items-center hover:bg-emphasis transition-colors duration-150 cursor-pointer"
            >
              <i class="pi pi-cog !mr-4"></i>
              <span class="hidden sm:inline">Settings</span>
            </a>
            <a
              class="flex p-2 rounded-border items-center hover:bg-emphasis transition-colors duration-150 cursor-pointer"
            >
              <i class="pi pi-power-off !mr-4"></i>
              <span class="hidden sm:inline">Sign Out</span>
            </a>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
