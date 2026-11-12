<script setup lang="ts">
import { computed, h, ref, watch, type Ref } from 'vue'
import type { GcsExtensionJsonConfig, GcsResolvedExtension } from '@gcs-ssc/extensions'
import { ExtensionFormField, ExtensionInput, ExtensionSaveButton, useExtensionApi, useExtensionI18n, useExtensionToast } from '@gcs-ssc/extensions/ui'
import { messages } from '../i18n/messages'
import { useRequestState } from '../composables/useRequestState'

const { agencyId, extension, persistedConfig, enabled = true, disabled = false, readOnly = false } = defineProps<{
  agencyId: string; extension: GcsResolvedExtension; persistedConfig?: GcsExtensionJsonConfig;
  enabled?: boolean; disabled?: boolean; readOnly?: boolean
}>()
defineModel<GcsExtensionJsonConfig>({ required: true })
const { t } = useExtensionI18n(messages)
const toast = useExtensionToast()
const api = computed(() => useExtensionApi(extension.key))
const apiKey: Ref<string> = ref('')
const configured: Ref<boolean> = ref(false)
const summaryRequest = useRequestState<boolean, 'failed'>()
const keyRequest = useRequestState<void, 'failed'>()
const pending = keyRequest.pending
const feedback = computed(() => keyRequest.error.value ?? summaryRequest.error.value)
const unavailable = computed(() => disabled || readOnly || !enabled || persistedConfig === undefined)
const saveKey = async () => {
  if (unavailable.value || pending.value || !apiKey.value.trim()) return
  const request = keyRequest.begin()
  if (!request) return
  summaryRequest.reset()
  try {
    await api.value.put(`/agencies/${agencyId}/credentials`, { apiKey: apiKey.value }, { signal: request.signal })
    if (!keyRequest.succeed(request, undefined)) return
    summaryRequest.reset()
    apiKey.value = ''; configured.value = true
    toast.add({ title: () => h('span', t('successNotice')), description: () => h('span', t('keySaved')), color: 'success' })
  } catch { keyRequest.fail(request, 'failed') }
}
watch(() => [agencyId, extension.key, enabled, disabled, readOnly, persistedConfig !== undefined], async () => {
  summaryRequest.reset(); keyRequest.reset()
  apiKey.value = ''; configured.value = false
  if (unavailable.value) return
  const request = summaryRequest.begin()
  if (!request) return
  try {
    const summary = await api.value.get<{ configured: boolean }>(`/agencies/${agencyId}/credentials`, { signal: request.signal })
    if (summaryRequest.succeed(request, summary.configured)) configured.value = summary.configured
  } catch { summaryRequest.fail(request, 'failed') }
}, { immediate: true, flush: 'sync' })
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
