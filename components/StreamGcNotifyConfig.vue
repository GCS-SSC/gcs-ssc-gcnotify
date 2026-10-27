<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { z } from 'zod'
import { FetchResponseError, type GcsExtensionJsonConfig, type GcsNotificationTemplate, type GcsResolvedExtension } from '@gcs-ssc/extensions'
import { ExtensionAlert, ExtensionButton, ExtensionEntityEditorWorkspace, ExtensionFormField, ExtensionResourceLayoutCard, ExtensionSaveButton, ExtensionSelectMenu, useExtensionApi, useExtensionI18n, useExtensionToast, useHostApi } from '@gcs-ssc/extensions/ui'
import { messages } from '../i18n/messages'
import { StreamConfigSchema } from '../shared/config'

const { extension, streamId, streamEnabled = false, hostLayout = false } = defineProps<{
  extension: GcsResolvedExtension; streamId: string; agencyId?: string; transferPaymentId?: string;
  streamEnabled?: boolean; hostLayout?: boolean
}>()
const config = defineModel<GcsExtensionJsonConfig>({ required: true })
const { t, locale } = useExtensionI18n(messages)
const api = computed(() => useExtensionApi(extension.key))
const host = useHostApi()
const toast = useExtensionToast()
const BilingualSchema = z.object({ en: z.string(), fr: z.string() })
const CatalogSchema = z.object({
  notifiers: z.array(z.object({
    id: z.string(), name: BilingualSchema,
    fields: z.array(z.object({ id: z.string(), name: BilingualSchema }))
  }))
})
type Notifier = z.infer<typeof CatalogSchema>['notifiers'][number]
type TemplateRow = GcsNotificationTemplate & { available: boolean }
const templates: Ref<GcsNotificationTemplate[]> = ref([])
const notifiers: Ref<Notifier[]> = ref([])
const selectedId: Ref<string | null> = ref(null)
const selectedNotifier: Ref<string | undefined> = ref(undefined)
const loading: Ref<boolean> = ref(false)
const loadFailed: Ref<boolean> = ref(false)
const saving: Ref<boolean> = ref(false)
const feedback: Ref<'saved' | 'failed' | 'invalid' | null> = ref(null)
const saveFailure: Ref<{ kind: 'api'; message: string } | { kind: 'generic' } | null> = ref(null)
const fieldErrors: Ref<Record<string, string>> = ref({})
const mappingSection: Ref<HTMLElement | null> = ref(null)
const saveFailureMessage = computed(() => saveFailure.value?.kind === 'api' ? saveFailure.value.message : saveFailure.value ? t('saveFailed') : '')
const ApiFailureSchema = z.object({ message: z.string().optional(), details: z.array(z.object({ path: z.string(), message: z.string() })).optional() })

const search: Ref<string> = ref('')
const pagination = ref({ pageIndex: 0, pageSize: 10 })
const parsedConfig = computed(() => StreamConfigSchema.safeParse(config.value))
const mappings = computed(() => parsedConfig.value.data?.mappings ?? [])
const rows = computed<TemplateRow[]>(() => [
  ...templates.value.map(template => ({ ...template, available: true })),
  ...mappings.value.filter((mapping, index, all) => !templates.value.some(template => template.id === mapping.templateId) && all.findIndex(item => item.templateId === mapping.templateId) === index).map(mapping => ({ id: mapping.templateId, name: mapping.templateId, kind: 'email' as const, requiredPersonalisation: Object.keys(mapping.personalisation), available: false }))
])
const filteredRows = computed(() => rows.value.filter(row => `${row.name} ${row.id}`.toLocaleLowerCase().includes(search.value.toLocaleLowerCase())))
const visibleRows = computed(() => filteredRows.value.slice(pagination.value.pageIndex * pagination.value.pageSize, (pagination.value.pageIndex + 1) * pagination.value.pageSize))
const selectedTemplate = computed(() => rows.value.find(row => row.id === selectedId.value))
const selectedMapping = computed(() => mappings.value.find(mapping => mapping.notifierId === selectedNotifier.value && mapping.templateId === selectedId.value))
const mappingIndex = computed(() => mappings.value.findIndex(mapping => mapping.notifierId === selectedNotifier.value && mapping.templateId === selectedId.value))
const placeholderPath = (placeholder: string): string => `mappings.${mappingIndex.value}.personalisation.${placeholder}`
const chooseTemplate = async (templateId: string) => {
  selectedId.value = templateId
  selectedNotifier.value = mappings.value.find(mapping => mapping.templateId === templateId)?.notifierId
  await nextTick()
  const control = mappingSection.value?.querySelector<HTMLElement>('[role="combobox"], select')
  control?.focus({ preventScroll: true })
  control?.scrollIntoView?.({ block: 'nearest' })
}
const chooseNotifier = (value: unknown) => {
  if (typeof value !== 'string' || !selectedId.value) return
  if (!notifiers.value.some(notifier => notifier.id === value)) return
  selectedNotifier.value = value
  saveFailure.value = null; fieldErrors.value = {}
  const existing = mappings.value.find(mapping => mapping.notifierId === value)
  if (existing) return
  config.value = { mappings: [...mappings.value, { templateId: selectedId.value, notifierId: value, personalisation: {} }] }
}
const removeMapping = () => {
  saveFailure.value = null; fieldErrors.value = {}
  config.value = { mappings: mappings.value.filter(mapping => mapping.notifierId !== selectedNotifier.value) }
  selectedNotifier.value = undefined
}
const notifierOptions = computed(() => notifiers.value.map(notifier => ({ value: notifier.id, label: notifier.name[locale.value], disabled: mappings.value.some(mapping => mapping.notifierId === notifier.id && mapping.templateId !== selectedId.value) })))
const fieldOptions = computed(() => notifiers.value.find(notifier => notifier.id === selectedNotifier.value)?.fields.map(field => ({ value: field.id, label: field.name[locale.value] })) ?? [])
const columns = computed(() => [{ id: 'name', header: t('template') }, { id: 'notifier', header: t('hostNotifier') }, { id: 'actions', header: t('actions') }])
const mappedNotifierName = (templateId: string): string => {
  const assigned = mappings.value.filter(item => item.templateId === templateId).map(mapping => notifiers.value.find(item => item.id === mapping.notifierId)?.name[locale.value] ?? mapping.notifierId)
  return assigned.length ? assigned.join(', ') : t('noMapping')
}
const setField = (placeholder: string, value: unknown) => {
  if (!selectedMapping.value) return
  const personalisation = { ...selectedMapping.value.personalisation }
  if (typeof value === 'string' && fieldOptions.value.some(field => field.value === value)) personalisation[placeholder] = value
  else delete personalisation[placeholder]
  const nextErrors = { ...fieldErrors.value }; delete nextErrors[placeholderPath(placeholder)]; fieldErrors.value = nextErrors
  if (!Object.keys(nextErrors).length) saveFailure.value = null
  config.value = { mappings: mappings.value.map(mapping => mapping.notifierId === selectedNotifier.value ? { ...mapping, personalisation } : mapping) }
}
let session = 0
const load = async () => {
  if (!streamEnabled || loading.value) return
  const current = session
  loading.value = true; loadFailed.value = false; feedback.value = null
  try {
    const [remote, catalog] = await Promise.all([
      api.value.get<{ templates: GcsNotificationTemplate[] }>(`/streams/${streamId}/templates`),
      host.get<unknown>(`/api/extensions/streams/${streamId}/notifiers`)
    ])
    const parsed = CatalogSchema.parse(catalog)
    if (current !== session) return
    templates.value = remote.templates; notifiers.value = parsed.notifiers
  } catch { if (current === session) { feedback.value = 'failed'; loadFailed.value = true } }
  finally { if (current === session) loading.value = false }
}
const save = async () => {
  if (!streamEnabled || saving.value) return
  if (!parsedConfig.value.success) { feedback.value = 'invalid'; return }
  const current = session
  saving.value = true; feedback.value = null; saveFailure.value = null; fieldErrors.value = {}
  try {
    await host.patch(`/api/extensions/streams/${streamId}`, { extensionKey: extension.key, enabled: streamEnabled, config: parsedConfig.value.data }, { signal: AbortSignal.timeout(15_000), headers: { 'accept-language': locale.value } })
    if (current === session) feedback.value = 'saved'
  } catch (error: unknown) {
    if (current !== session) return
    if (error instanceof FetchResponseError) {
      const nested = z.object({ data: ApiFailureSchema }).safeParse(error.data)
      const parsed = nested.success ? nested.data.data : ApiFailureSchema.safeParse(error.data).data
      const message = parsed?.details?.find(detail => detail.message)?.message ?? parsed?.message
      saveFailure.value = message ? { kind: 'api', message } : { kind: 'generic' }
      fieldErrors.value = Object.fromEntries((parsed?.details ?? []).map(detail => [detail.path, detail.message]))
      const firstPath = parsed?.details?.[0]?.path
      const index = firstPath?.match(/^mappings\.(\d+)\./)?.[1]
      const mapping = index === undefined ? undefined : mappings.value[Number(index)]
      if (mapping) { selectedId.value = mapping.templateId; selectedNotifier.value = mapping.notifierId }
    } else saveFailure.value = { kind: 'generic' }
    toast.add({ title: () => h('span', t('saveFailed')), description: saveFailure.value.kind === 'api' ? saveFailure.value.message : () => h('span', t('saveFailed')), color: 'error' })
    saving.value = false
    await nextTick()
    if (current === session) mappingSection.value?.querySelector<HTMLElement>('[role="combobox"][aria-invalid="true"], select[aria-invalid="true"]')?.focus()
  }
  finally { if (current === session) saving.value = false }

}
watch(() => [streamId, extension.key, streamEnabled], () => {
  session += 1; templates.value = []; notifiers.value = []; selectedId.value = null; selectedNotifier.value = undefined; loading.value = false; loadFailed.value = false; saving.value = false; feedback.value = null; saveFailure.value = null; fieldErrors.value = {}; search.value = ''; pagination.value.pageIndex = 0
  void load()
}, { immediate: true })
watch(search, () => { pagination.value.pageIndex = 0 })
onBeforeUnmount(() => { session += 1 })
</script>

<template>
  <ExtensionEntityEditorWorkspace :content-test-id="hostLayout ? 'gcnotify-config-page-content' : undefined" data-field-scope="extension.gcs-ssc-gcnotify.stream-config">
    <div class="space-y-6">
      <p>{{ t('streamHelp') }}</p>
      <ExtensionAlert v-if="!streamEnabled" color="warning" :title="t('streamDisabled')" />
      <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
        <ExtensionButton class="w-full justify-center sm:w-auto" :disabled="!streamEnabled || loading || saving" @click="load">{{ t('load') }}</ExtensionButton>
        <ExtensionSaveButton class="w-full justify-center sm:w-auto" :label="t('saveMappings')" type="button" :loading="saving" :disabled="!streamEnabled || loading" @click="save" />
      </div>
      <ExtensionResourceLayoutCard data-field-container="Search and pagination are optional local template-list filters, not persisted configuration." v-model:search="search" v-model:pagination="pagination" :data="visibleRows" :columns="columns" :total-records="filteredRows.length" :loading="loading" :request-status="loading ? 'pending' : loadFailed && !rows.length ? 'error' : 'success'" :show-button="false" :show-column-toggle="false" @retry="load">
        <template #name-cell="{ row }">
          <div class="font-medium text-highlighted">{{ row.original.name }}</div>
          <div class="text-xs text-muted">{{ row.original.id }}</div>
          <p v-if="!row.original.available" class="text-sm text-warning">{{ t('templateUnavailable') }}</p>
        </template>
        <template #notifier-cell="{ row }">{{ mappedNotifierName(row.original.id) }}</template>
        <template #actions-cell="{ row }">
          <ExtensionButton :aria-pressed="selectedId === row.original.id" :aria-label="t('configureTemplate', { template: row.original.name })" :disabled="!streamEnabled || loading || saving" @click="chooseTemplate(row.original.id)">{{ t('configureMapping') }}</ExtensionButton>
        </template>
      </ExtensionResourceLayoutCard>
      <section v-if="selectedTemplate" ref="mappingSection" class="space-y-4">
        <h3 class="text-base font-semibold text-highlighted">{{ selectedTemplate.name }}</h3>
        <ExtensionFormField :label="t('hostNotifier')" :error="fieldErrors[`mappings.${mappingIndex}.notifierId`]" :required="false" data-ui-target="extension.gcs-ssc-gcnotify.stream-config.notifier">
          <ExtensionSelectMenu :model-value="selectedNotifier" :placeholder="t('chooseNotifier')" :aria-invalid="Boolean(fieldErrors[`mappings.${mappingIndex}.notifierId`]) || undefined" :items="notifierOptions" @update:model-value="chooseNotifier" value-key="value" :disabled="!streamEnabled || loading || saving" />
        </ExtensionFormField>
        <template v-if="selectedMapping">
          <ExtensionButton :disabled="!streamEnabled || loading || saving" @click="removeMapping">{{ t('removeMapping') }}</ExtensionButton>
          <ExtensionFormField v-for="placeholder in selectedTemplate.requiredPersonalisation" :key="placeholder" :label="t('mapping', { placeholder })" :name="placeholderPath(placeholder)" :error="fieldErrors[placeholderPath(placeholder)]" required data-ui-target="extension.gcs-ssc-gcnotify.stream-config.placeholder">
            <ExtensionSelectMenu :model-value="selectedMapping.personalisation[placeholder]" :aria-invalid="Boolean(fieldErrors[placeholderPath(placeholder)]) || undefined" :items="fieldOptions" value-key="value" :disabled="!streamEnabled || loading || saving" required aria-required="true" @update:model-value="setField(placeholder, $event)" />
          </ExtensionFormField>
        </template>
      </section>
      <ExtensionAlert v-if="saveFailure" color="error" role="alert" :title="t('saveFailed')" :description="saveFailureMessage" />
      <p v-if="feedback" role="status">{{ t(feedback) }}</p>
    </div>
  </ExtensionEntityEditorWorkspace>
</template>
