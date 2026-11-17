import type { App } from 'vue'

const modules = import.meta.glob('./*.vue', { eager: true })

// const excludeFiles = ['./index.vue', './CustomFormExample.vue', './CustomFormDialogExample.vue']
const excludeFiles = ['./index.vue']

const components: Record<string, any> = {}

Object.entries(modules).forEach(([path, module]) => {
  if (excludeFiles.includes(path)) {
    return
  }

  const componentName = path.split('/').pop()?.replace('.vue', '') || ''

  const component = (module as any).default

  if (componentName && component) {
    components[componentName] = component
  }
})

const ComponentsPlugin = {
  install(app: App) {
    Object.entries(components).forEach(([name, component]) => {
      app.component(name, component)
    })
    if (import.meta.env.DEV) {
      console.log('h:', Object.keys(components))
    }
  }
}

export default ComponentsPlugin
export const GlobalComponents = components
export type { FormConfig } from '@shared/types/render'
