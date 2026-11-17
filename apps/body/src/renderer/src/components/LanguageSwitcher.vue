<template>
  <Select
    v-model="selectedLanguage"
    :options="languages"
    option-label="name"
    option-value="code"
    class="language-switcher"
    @change="handleLanguageChange"
  >
    <template #value="slotProps">
      <div v-if="slotProps.value" class="flex align-items-center">
        <i :class="getLanguageIcon(slotProps.value)" class="mr-2"></i>
        <div>{{ getLanguageName(slotProps.value) }}</div>
      </div>
      <!-- <span v-else>
        {{ $t('common.selectLanguage') }}
      </span> -->
    </template>
    <template #option="slotProps">
      <div class="flex align-items-center">
        <i :class="getLanguageIcon(slotProps.option.code)" class="mr-2"></i>
        <div>{{ slotProps.option.name }}</div>
      </div>
    </template>
  </Select>
</template>

<script setup lang="ts">
import { useI18n } from '@renderer/composables/useI18n'
import Select from 'primevue/select'
import { onMounted, ref } from 'vue'

const { switchLanguage, getCurrentLanguage } = useI18n()

const selectedLanguage = ref<'zh' | 'en'>('zh')

const languages = [
  { name: '中文', code: 'zh' as const },
  { name: 'English', code: 'en' as const }
]

const getLanguageIcon = (code: string) => {
  return code === 'zh' ? 'pi pi-flag' : 'pi pi-flag-fill'
}

const getLanguageName = (code: string) => {
  const lang = languages.find((l) => l.code === code)
  return lang?.name || code
}

const handleLanguageChange = async (event: any) => {
  const newLanguage = event.value
  const success = await switchLanguage(newLanguage)
  if (success) {
    selectedLanguage.value = newLanguage
  }
}

onMounted(async () => {
  const currentLang = await getCurrentLanguage()
  selectedLanguage.value = currentLang
})
</script>

<style scoped>
.language-switcher {
  min-width: 120px;
}
</style>
