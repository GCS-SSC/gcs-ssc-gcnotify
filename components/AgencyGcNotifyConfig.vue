<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { GcsExtensionJsonConfig, GcsResolvedExtension } from '@gcs-ssc/extensions'
import { ExtensionFormField, ExtensionInput, ExtensionSaveButton, useExtensionApi, useExtensionI18n } from '@gcs-ssc/extensions/ui'
import { messages } from '../i18n/messages'

const { agencyId, extension, persistedConfig, enabled = true, disabled = false, readOnly = false } = defineProps<{
  agencyId: string; extension: GcsResolvedExtension; persistedConfig?: GcsExtensionJsonConfig;
  enabled?: boolean; disabled?: boolean; readOnly?: boolean
}>()
defineModel<GcsExtensionJsonConfig>({ required: true })
const { t } = useExtensionI18n(messages)
const api = computed(() => useExtensionApi(extension.key))
const apiKey: Ref<string> = ref('')
const configured: Ref<boolean> = ref(false)
const pending: Ref<boolean> = ref(false)
const feedback: Ref<'keySaved' | 'failed' | null> = ref(null)
const unavailable = computed(() => disabled || readOnly || !enabled || persistedConfig === undefined)
let session = 0
const saveKey = async () => {
  if (unavailable.value || pending.value || !apiKey.value.trim()) return
  const current = session
  pending.value = true; feedback.value = null
  try {
    await api.value.put(`/agencies/${agencyId}/credentials`, { apiKey: apiKey.value })
    if (current !== session) return
    apiKey.value = ''; configured.value = true; feedback.value = 'keySaved'
  } catch { if (current === session) feedback.value = 'failed' }
  finally { if (current === session) pending.value = false }
}
watch(() => [agencyId, extension.key, enabled, disabled, readOnly, persistedConfig !== undefined], async () => {
  const current = ++session
  apiKey.value = ''; configured.value = false; feedback.value = null; pending.value = false
  if (unavailable.value) return
  try {
    const summary = await api.value.get<{ configured: boolean }>(`/agencies/${agencyId}/credentials`)
    if (current === session) configured.value = summary.configured
  } catch { if (current === session) feedback.value = 'failed' }
}, { immediate: true })
onBeforeUnmount(() => { session += 1 })
</script>

<template>
  <div class="space-y-4" data-field-scope="extension.gcs-ssc-gcnotify.agency-config">
    <p v-if="unavailable">{{ t('saveFirst') }}</p>
    <p role="status">{{ configured ? t('keyConfigured') : t('keyMissing') }}</p>
    <ExtensionFormField :label="t('apiKey')" :description="t('keyHelp')" :required="false" data-ui-target="extension.gcs-ssc-gcnotify.agency-config.api-key">
      <ExtensionInput v-model="apiKey" type="password" autocomplete="new-password" :disabled="unavailable || pending" :required="false" aria-required="false" />
    </ExtensionFormField>
    <ExtensionSaveButton :label="t('saveKey')" :disabled="unavailable || !apiKey.trim()" :loading="pending" type="button" @click="saveKey" />
    <p v-if="feedback" role="status">{{ t(feedback) }}</p>
  </div>
</template>
