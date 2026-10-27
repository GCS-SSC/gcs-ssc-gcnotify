<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { z } from 'zod'
import type { GcsExtensionJsonConfig, GcsNotificationTemplate, GcsResolvedExtension } from '@gcs-ssc/extensions'
import { ExtensionButton, ExtensionFormField, ExtensionInput, ExtensionSaveButton, ExtensionSelectMenu, useExtensionApi, useExtensionI18n, useHostApi } from '@gcs-ssc/extensions/ui'
import { messages } from '../i18n/messages'
import { HOST_FIELDS } from '../shared/config'

const { agencyId, extension, persistedConfig, enabled = true, disabled = false, readOnly = false } = defineProps<{
  agencyId: string; extension: GcsResolvedExtension; persistedConfig?: GcsExtensionJsonConfig;
  enabled?: boolean; disabled?: boolean; readOnly?: boolean
}>()
const model = defineModel<GcsExtensionJsonConfig>({ required: true })
const { t, locale } = useExtensionI18n(messages)
const api = computed(() => useExtensionApi(extension.key))
const host = useHostApi()
const apiKey: Ref<string> = ref('')
const configured: Ref<boolean> = ref(false)
const pending: Ref<boolean> = ref(false)
const feedback: Ref<'keySaved' | 'failed' | null> = ref(null)
const templates: Ref<GcsNotificationTemplate[]> = ref([])
const catalog: Ref<{ id: string; name: { en: string; fr: string }; fields: { id: string; name: { en: string; fr: string } }[] }[]> = ref([])
const EditorMappingSchema = z.object({ templateId: z.string(), personalisation: z.record(z.string(), z.string()) })
const EditorConfigSchema = z.object({ mappings: z.object({ 'approval.action_required': EditorMappingSchema.optional() }).optional() })
const mapping = computed(() => EditorConfigSchema.safeParse(model.value).data?.mappings?.['approval.action_required'])
const notifier = computed(() => catalog.value.find(item => item.id === 'approval.action_required'))
const unavailable = computed(() => disabled || readOnly || !enabled || persistedConfig === undefined)
const templateId = computed({
  get: () => mapping.value?.templateId,
  set: (value: string | undefined) => {
    model.value = { mappings: value ? { 'approval.action_required': { templateId: value, personalisation: {} } } : {} }
  }
})
const selectedTemplate = computed(() => templates.value.find(item => item.id === templateId.value))
const placeholders = computed(() => selectedTemplate.value?.requiredPersonalisation ?? Object.keys(mapping.value?.personalisation ?? {}))
const templateItems = computed(() => [
  { label: t('noMapping'), value: '' },
  ...templates.value.map(item => ({ label: item.name, value: item.id })),
  ...(templateId.value && !selectedTemplate.value ? [{ label: templateId.value, value: templateId.value }] : [])
])
const fieldItems = computed(() => (notifier.value?.fields ?? HOST_FIELDS.map(id => ({ id, name: { en: messages.en[id], fr: messages.fr[id] } }))).map(field => ({ label: field.name[locale.value], value: field.id })))
const setField = (placeholder: string, value: unknown) => {
  if (!mapping.value) return
  const personalisation = { ...mapping.value.personalisation }
  if (typeof value === 'string' && value) personalisation[placeholder] = value
  else delete personalisation[placeholder]
  model.value = { mappings: { 'approval.action_required': { templateId: mapping.value.templateId, personalisation } } }
}
let session = 0
const loadTemplates = async () => {
  if (unavailable.value || pending.value) return
  const current = session
  pending.value = true; feedback.value = null
  try {
    const result = await api.value.get<{ templates: GcsNotificationTemplate[] }>(`/agencies/${agencyId}/templates`)
    if (current === session) templates.value = result.templates
  } catch { if (current === session) feedback.value = 'failed' }
  finally { if (current === session) pending.value = false }
}
const saveKey = async () => {
  if (unavailable.value || pending.value) return
  const current = session
  pending.value = true; feedback.value = null
  try {
    await api.value.put(`/agencies/${agencyId}/credentials`, { apiKey: apiKey.value })
    if (current !== session) return
    apiKey.value = ''; configured.value = true; templates.value = []; feedback.value = 'keySaved'
  } catch { if (current === session) feedback.value = 'failed' }
  finally { if (current === session) pending.value = false }
}
watch(() => [agencyId, extension.key, enabled, disabled, readOnly, persistedConfig !== undefined], async () => {
  const current = ++session
  apiKey.value = ''; configured.value = false; templates.value = []; feedback.value = null; pending.value = false; catalog.value = []
  if (unavailable.value) return
  const results = await Promise.allSettled([
    api.value.get<{ configured: boolean }>(`/agencies/${agencyId}/credentials`),
    host.get<{ notifiers: typeof catalog.value }>(`/api/extensions/agency/${agencyId}/notifiers`)
  ])
  if (current !== session) return
  const [credentials, notifiers] = results
  if (credentials.status === 'fulfilled') configured.value = credentials.value.configured
  if (notifiers.status === 'fulfilled') catalog.value = notifiers.value.notifiers
  if (credentials.status === 'rejected' || notifiers.status === 'rejected') feedback.value = 'failed'
}, { immediate: true })
onBeforeUnmount(() => { session += 1 })
</script>

<template>
  <div class="space-y-4" data-field-scope="extension.gcs-ssc-gcnotify.agency-config">
    <p>{{ t('help') }}</p>
    <p v-if="unavailable">{{ t('saveFirst') }}</p>
    <p role="status">{{ configured ? t('keyConfigured') : t('keyMissing') }}</p>
    <ExtensionFormField :label="t('apiKey')" :description="t('keyHelp')" :required="false" data-ui-target="extension.gcs-ssc-gcnotify.agency-config.api-key">
      <ExtensionInput v-model="apiKey" type="password" autocomplete="new-password" :disabled="unavailable || pending" :required="false" aria-required="false" />
    </ExtensionFormField>
    <ExtensionSaveButton :label="t('saveKey')" :disabled="unavailable || !apiKey.trim()" :loading="pending" type="button" @click="saveKey" />
    <ExtensionButton :disabled="unavailable || pending || !configured" @click="loadTemplates">{{ t('load') }}</ExtensionButton>
    <ExtensionFormField :label="t('template')" :required="false" data-ui-target="extension.gcs-ssc-gcnotify.agency-config.template">
      <ExtensionSelectMenu v-model="templateId" :items="templateItems" value-key="value" :disabled="unavailable || pending" />
    </ExtensionFormField>
    <ExtensionFormField v-for="placeholder in placeholders" :key="placeholder" :label="t('mapping', { placeholder })" required data-ui-target="extension.gcs-ssc-gcnotify.agency-config.mapping">
      <ExtensionSelectMenu :model-value="mapping?.personalisation[placeholder]" :items="fieldItems" value-key="value" :disabled="unavailable || pending" required aria-required="true" @update:model-value="setField(placeholder, $event)" />
    </ExtensionFormField>
    <p v-if="feedback" role="status">{{ t(feedback) }}</p>
  </div>
</template>
