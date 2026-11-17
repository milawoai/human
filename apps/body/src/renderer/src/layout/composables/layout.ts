import { computed, reactive, ref, ComputedRef } from 'vue'
import logoDark from '@renderer/assets/image/logo-dark.png'
import logoLight from '@renderer/assets/image/logo-light.png'
interface LayoutConfig {
  preset: string
  primary: string
  surface: string | null
  darkTheme: boolean
  menuMode: 'slim' | 'slim-plus' | 'horizontal' | 'overlay'
  layoutTheme: string
  theme?: string
}

interface LayoutState {
  staticMenuDesktopInactive: boolean
  overlayMenuActive: boolean
  configSidebarVisible: boolean
  staticMenuMobileActive: boolean
  menuHoverActive: boolean
  rightMenuActive: boolean
  topbarMenuActive: boolean
  sidebarActive: boolean
  activeMenuItem: any | null
  overlaySubmenuActive: boolean
}

interface Tab {
  id: string | number
  title: string
  content: any
  [key: string]: any
}

const layoutConfig = reactive<LayoutConfig>({
  preset: 'Aura',
  primary: 'emerald',
  surface: null,
  darkTheme: false,
  menuMode: 'slim',
  layoutTheme: 'colorScheme'
})

const layoutState = reactive<LayoutState>({
  staticMenuDesktopInactive: false,
  overlayMenuActive: false,
  configSidebarVisible: false,
  staticMenuMobileActive: false,
  menuHoverActive: false,
  rightMenuActive: false,
  topbarMenuActive: false,
  sidebarActive: false,
  activeMenuItem: null,
  overlaySubmenuActive: false
})

const tabs = ref<Tab[]>([])

export function useLayout() {
  const setActiveMenuItem = (item: any): void => {
    layoutState.activeMenuItem = item.value || item
  }

  const toggleMenu = (): void => {
    if (layoutConfig.menuMode === 'overlay') {
      layoutState.overlayMenuActive = !layoutState.overlayMenuActive
    }

    if (window.innerWidth > 991) {
      layoutState.staticMenuDesktopInactive = !layoutState.staticMenuDesktopInactive
    } else {
      layoutState.staticMenuMobileActive = !layoutState.staticMenuMobileActive
    }
  }

  const toggleConfigSidebar = (): void => {
    if (isSidebarActive.value) {
      layoutState.overlayMenuActive = false
      layoutState.overlaySubmenuActive = false
      layoutState.staticMenuMobileActive = false
      layoutState.menuHoverActive = false
    }
    layoutState.configSidebarVisible = !layoutState.configSidebarVisible
  }

  const openTab = (value: Tab): void => {
    tabs.value = [...tabs.value, value]
  }

  const closeTab = (index: number): void => {
    tabs.value.splice(index, 1)
    tabs.value = [...tabs.value]
  }

  const isSidebarActive: ComputedRef<boolean> = computed(
    () =>
      layoutState.overlayMenuActive ||
      layoutState.staticMenuMobileActive ||
      layoutState.overlaySubmenuActive
  )

  const isDesktop: ComputedRef<boolean> = computed(() => window.innerWidth > 991)

  const isSlim: ComputedRef<boolean> = computed(() => layoutConfig.menuMode === 'slim')
  const isSlimPlus: ComputedRef<boolean> = computed(() => layoutConfig.menuMode === 'slim-plus')
  const isHorizontal: ComputedRef<boolean> = computed(() => layoutConfig.menuMode === 'horizontal')
  const isOverlay: ComputedRef<boolean> = computed(() => layoutConfig.menuMode === 'overlay')

  const isDarkTheme: ComputedRef<boolean> = computed(() => layoutConfig.darkTheme)
  const getPrimary: ComputedRef<string> = computed(() => layoutConfig.primary)
  const getSurface: ComputedRef<string | null> = computed(() => layoutConfig.surface)

  const logo: ComputedRef<string> = computed(() => {
    return isDarkTheme.value ? logoLight : logoDark
  })

  return {
    layoutConfig,
    layoutState,
    getPrimary,
    getSurface,
    isDarkTheme,
    toggleMenu,
    isSidebarActive,
    setActiveMenuItem,
    toggleConfigSidebar,
    isSlim,
    isSlimPlus,
    isHorizontal,
    isDesktop,
    isOverlay,
    openTab,
    tabs,
    closeTab,
    logo
  }
}
