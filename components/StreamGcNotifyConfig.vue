<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import { z } from 'zod'
import { FetchResponseError, type GcsExtensionJsonConfig, type GcsNotificationTemplate, type GcsResolvedExtension } from '@gcs-ssc/extensions'
import { ExtensionAlert, ExtensionButton, ExtensionFormField, ExtensionModal, ExtensionResourceLayoutPage, ExtensionSaveButton, ExtensionSelectMenu, useExtensionApi, useExtensionConfirmDialog, useExtensionI18n, useExtensionToast, useHostApi } from '@gcs-ssc/extensions/ui'
import { messages } from '../i18n/messages'
import { isValidTimeZone, StreamConfigSchema, type StreamMapping } from '../shared/config'

const { extension, streamId, streamEnabled = false } = defineProps<{
  extension: GcsResolvedExtension; streamId: string; agencyId?: string; transferPaymentId?: string;
  streamEnabled?: boolean; hostLayout?: boolean
}>()
const config = defineModel<GcsExtensionJsonConfig>({ required: true })
const { t, locale } = useExtensionI18n(messages)
const api = computed(() => useExtensionApi(extension.key))
const host = useHostApi()
const toast = useExtensionToast()
const confirm = useExtensionConfirmDialog()
const BilingualSchema = z.object({ en: z.string(), fr: z.string() })
const CatalogSchema = z.object({ notifiers: z.array(z.object({ id: z.string(), name: BilingualSchema, fields: z.array(z.object({ id: z.string(), name: BilingualSchema, group: z.object({ id: z.string(), name: BilingualSchema }), type: z.enum(['text', 'date', 'time']) })) })) })
type Notifier = z.infer<typeof CatalogSchema>['notifiers'][number]
type Selection = { kind: 'unselected' } | { kind: 'binding'; templateId: string; personalisation: StreamMapping['personalisation'] }
type EditDraft = { notifier: Notifier; selection: Selection }
type Failure = { kind: 'api'; message: string } | { kind: 'generic' }
const notifiers: Ref<Notifier[]> = ref([])
const templateCache: Ref<GcsNotificationTemplate[]> = ref([])
const modalTemplates: Ref<GcsNotificationTemplate[]> = ref([])
const editing: Ref<EditDraft | null> = ref(null)
const loading: Ref<boolean> = ref(false)
const loadFailed: Ref<boolean> = ref(false)
const templatesLoading: Ref<boolean> = ref(false)
const templateFailure: Ref<Failure | null> = ref(null)
const templateController: Ref<AbortController | null> = ref(null)
const saveRequest: Ref<{ session: number; controller: AbortController } | null> = ref(null)
const saveFailure: Ref<Failure | null> = ref(null)
const unlinkRequest: Ref<{ scope: number; controller: AbortController | null } | null> = shallowRef(null)
const fieldErrors: Ref<Record<string, string>> = ref({})
const mappingFields: Ref<HTMLElement | null> = ref(null)
const saveFailureMessage = computed(() => saveFailure.value?.kind === 'api' ? saveFailure.value.message : saveFailure.value ? t('saveFailed') : '')
const templateFailureMessage = computed(() => templateFailure.value?.kind === 'api' ? templateFailure.value.message : t('failed'))
const ApiFailureSchema = z.object({ message: z.string().optional(), details: z.array(z.object({ path: z.string(), message: z.string() })).optional() })
const apiFailure = (error: unknown) => {
  if (!(error instanceof FetchResponseError)) return null
  const nested = z.object({ data: ApiFailureSchema }).safeParse(error.data)
  return nested.success ? nested.data.data : ApiFailureSchema.safeParse(error.data).data ?? null
}
const search: Ref<string> = ref('')
const pagination = ref({ pageIndex: 0, pageSize: 10 })
const storedConfig = computed(() => StreamConfigSchema.safeParse(config.value))
const mappings = computed(() => storedConfig.value.data?.mappings ?? [])
const templateName = (notifierId: string): string => {
  const mapping = mappings.value.find(item => item.notifierId === notifierId)
  return mapping ? templateCache.value.find(template => template.id === mapping.templateId)?.name ?? mapping.templateId : t('noMapping')
}
const filteredRows = computed(() => notifiers.value.filter(notifier => `${notifier.name[locale.value]} ${notifier.id} ${templateName(notifier.id)}`.toLocaleLowerCase().includes(search.value.toLocaleLowerCase())))
const visibleRows = computed(() => filteredRows.value.slice(pagination.value.pageIndex * pagination.value.pageSize, (pagination.value.pageIndex + 1) * pagination.value.pageSize))
const binding = computed(() => editing.value?.selection.kind === 'binding' ? editing.value.selection : null)
const selectedTemplate = computed(() => modalTemplates.value.find(template => template.id === binding.value?.templateId))
const templateUnavailable = computed(() => Boolean(binding.value && !templatesLoading.value && !templateFailure.value && !selectedTemplate.value))
const templateOptions = computed(() => [
  ...modalTemplates.value.map(template => ({ value: template.id, label: template.name })),
  ...(binding.value && !selectedTemplate.value ? [{ value: binding.value.templateId, label: binding.value.templateId, disabled: true }] : [])
])
const fieldOptions = computed(() => {
  const groups = new Map<string, Array<{ type: 'label'; label: string } | { value: string; label: string }>>()
  for (const field of editing.value?.notifier.fields ?? []) {
    const group = groups.get(field.group.id) ?? [{ type: 'label', label: field.group.name[locale.value] }]
    group.push({ value: field.id, label: field.name[locale.value] }); groups.set(field.group.id, group)
  }
  return [...groups.values()]
})
const mappedFieldId = (placeholder: string): string | undefined => {
  const value = binding.value?.personalisation[placeholder]
  return typeof value === 'string' ? value : value?.fieldId
}
const needsTimeZone = (placeholder: string): boolean => {
  const field = editing.value?.notifier.fields.find(item => item.id === mappedFieldId(placeholder))
  return field?.type === 'date' || field?.type === 'time'
}
const mappedTimeZone = (placeholder: string): string | undefined => {
  const value = binding.value?.personalisation[placeholder]
  return typeof value === 'object' ? value.timeZone : undefined
}
const timeZoneOptions = computed(() => {
  const zones = new Set(['UTC', ...Intl.supportedValuesOf('timeZone')])
  for (const value of Object.values(binding.value?.personalisation ?? {})) if (typeof value === 'object' && isValidTimeZone(value.timeZone)) zones.add(value.timeZone)
  return [...zones].sort().map(value => ({ value, label: value }))
})
const proposedConfig = computed(() => {
  if (!storedConfig.value.success || !editing.value) return null
  const retained = mappings.value.filter(mapping => mapping.notifierId !== editing.value?.notifier.id)
  return StreamConfigSchema.safeParse({ mappings: binding.value ? [...retained, { templateId: binding.value.templateId, notifierId: editing.value.notifier.id, personalisation: binding.value.personalisation }] : retained })
})
const mappingIndex = computed(() => mappings.value.filter(mapping => mapping.notifierId !== editing.value?.notifier.id).length)
const placeholderPath = (placeholder: string): string => `mappings.${mappingIndex.value}.personalisation.${placeholder}`
const columns = computed(() => [{ id: 'name', header: t('hostNotifier') }, { id: 'template', header: t('template') }, { id: 'actions', header: t('actions') }])
let scopeSession = 0
let editSession = 0
let templateSession = 0
const saving = computed(() => saveRequest.value?.session === editSession)
const busy = computed(() => saving.value || unlinkRequest.value !== null)
const canSave = computed(() => Boolean(streamEnabled && editing.value && !busy.value && binding.value && selectedTemplate.value && !templatesLoading.value && !templateFailure.value))
const isMapped = (notifierId: string): boolean => mappings.value.some(mapping => mapping.notifierId === notifierId)
const closeEditor = () => {
  editSession += 1; templateSession += 1
  saveRequest.value?.controller.abort(); saveRequest.value = null
  templateController.value?.abort(); templateController.value = null
  editing.value = null; modalTemplates.value = []; templatesLoading.value = false; templateFailure.value = null; saveFailure.value = null; fieldErrors.value = {}
}
const loadTemplates = async () => {
  if (!editing.value || templatesLoading.value || saving.value) return
  const currentScope = scopeSession
  const currentEdit = editSession
  const currentTemplate = ++templateSession
  const controller = new AbortController()
  templateController.value?.abort(); templateController.value = controller
  templatesLoading.value = true; templateFailure.value = null
  try {
    const remote = await api.value.get<{ templates: GcsNotificationTemplate[] }>(`/streams/${streamId}/templates`, { signal: controller.signal })
    if (currentScope !== scopeSession || currentEdit !== editSession || currentTemplate !== templateSession || !editing.value) return
    modalTemplates.value = remote.templates; templateCache.value = remote.templates
  } catch (error: unknown) {
    if (currentScope !== scopeSession || currentEdit !== editSession || currentTemplate !== templateSession || !editing.value) return
    const parsed = apiFailure(error)
    const message = parsed?.details?.find(detail => detail.message)?.message ?? parsed?.message
    templateFailure.value = message ? { kind: 'api', message } : { kind: 'generic' }
  } finally {
    if (currentScope === scopeSession && currentEdit === editSession && currentTemplate === templateSession) { templatesLoading.value = false; templateController.value = null }
  }
}
const openEditor = (notifier: Notifier) => {
  if (busy.value) return
  closeEditor()
  const saved = mappings.value.find(mapping => mapping.notifierId === notifier.id)
  editing.value = { notifier, selection: saved ? { kind: 'binding', templateId: saved.templateId, personalisation: Object.fromEntries(Object.entries(saved.personalisation).map(([placeholder, value]) => [placeholder, typeof value === 'string' ? value : { ...value }])) } : { kind: 'unselected' } }
  void loadTemplates()
}
const chooseTemplate = (value: unknown) => {
  if (!editing.value || typeof value !== 'string' || !modalTemplates.value.some(template => template.id === value)) return
  if (binding.value?.templateId === value) return
  editing.value.selection = { kind: 'binding', templateId: value, personalisation: {} }; saveFailure.value = null; fieldErrors.value = {}
}
const setField = (placeholder: string, value: unknown) => {
  if (!binding.value) return
  const field = editing.value?.notifier.fields.find(item => item.id === value)
  if (field && typeof value === 'string') {
    if (mappedFieldId(placeholder) === value) return
    binding.value.personalisation[placeholder] = field.type === 'text' ? value : { fieldId: value, timeZone: '' }
  } else delete binding.value.personalisation[placeholder]
  const next = { ...fieldErrors.value }; delete next[placeholderPath(placeholder)]; delete next[`${placeholderPath(placeholder)}.timeZone`]; fieldErrors.value = next
  if (!Object.keys(next).length) saveFailure.value = null
}
const setTimeZone = (placeholder: string, value: unknown) => {
  const mapping = binding.value?.personalisation[placeholder]
  if (typeof mapping !== 'object') return
  mapping.timeZone = typeof value === 'string' ? value : ''
  const next = { ...fieldErrors.value }; delete next[`${placeholderPath(placeholder)}.timeZone`]; fieldErrors.value = next
  if (!Object.keys(next).length) saveFailure.value = null
}
const loadCatalog = async () => {
  if (!streamEnabled || loading.value) return
  const current = scopeSession
  loading.value = true; loadFailed.value = false
  try {
    const parsed = CatalogSchema.parse(await host.get<unknown>(`/api/extensions/streams/${streamId}/notifiers`))
    if (current === scopeSession) notifiers.value = parsed.notifiers
  } catch { if (current === scopeSession) loadFailed.value = true }
  finally { if (current === scopeSession) loading.value = false }
}
const save = async () => {
  if (!editing.value || !canSave.value) return
  const parsed = proposedConfig.value
  if (!parsed?.success) { saveFailure.value = { kind: 'generic' }; return }
  const currentScope = scopeSession
  const currentEdit = editSession
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 15_000)
  saveRequest.value = { session: currentEdit, controller }; saveFailure.value = null; fieldErrors.value = {}
  try {
    await host.patch(`/api/extensions/streams/${streamId}`, { extensionKey: extension.key, enabled: streamEnabled, config: parsed.data }, { signal: controller.signal, headers: { 'accept-language': locale.value } })
    if (currentScope !== scopeSession || currentEdit !== editSession || !editing.value) return
    config.value = parsed.data
    saveRequest.value = null; closeEditor()
    toast.add({ title: () => h('span', t('successNotice')), description: () => h('span', t('mappingsSaved')), color: 'success' })
  } catch (error: unknown) {
    if (currentScope !== scopeSession || currentEdit !== editSession || !editing.value) return
    const parsedError = apiFailure(error)
    const message = parsedError?.details?.find(detail => detail.message)?.message ?? parsedError?.message
    saveFailure.value = message ? { kind: 'api', message } : { kind: 'generic' }
    fieldErrors.value = Object.fromEntries((parsedError?.details ?? []).map(detail => [detail.path, detail.message]))
    toast.add({ title: () => h('span', t('saveFailed')), description: saveFailure.value.kind === 'api' ? saveFailure.value.message : () => h('span', t('saveFailed')), color: 'error' })
    saveRequest.value = null
    await nextTick()
    if (currentScope === scopeSession && currentEdit === editSession) mappingFields.value?.querySelector<HTMLElement>('[role="combobox"][aria-invalid="true"], select[aria-invalid="true"]')?.focus()
  } finally {
    globalThis.clearTimeout(timeout)
    if (saveRequest.value?.session === currentEdit) saveRequest.value = null
  }
}
const unlink = async (notifier: Notifier) => {
  if (!streamEnabled || busy.value || editing.value || !isMapped(notifier.id)) return
  const request: { scope: number; controller: AbortController | null } = { scope: scopeSession, controller: null }
  unlinkRequest.value = request
  try {
    const approved = await confirm({ title: t('unlinkTitle'), description: t('unlinkConfirm', { notifier: notifier.name[locale.value] }), confirmLabel: t('unlink'), cancelLabel: t('cancel'), confirmColor: 'error' })
    if (!approved || request.scope !== scopeSession || unlinkRequest.value !== request || !streamEnabled) return
    const parsed = StreamConfigSchema.safeParse({ mappings: mappings.value.filter(mapping => mapping.notifierId !== notifier.id) })
    if (!storedConfig.value.success || !parsed.success) throw new Error('Invalid Stream configuration')
    request.controller = new AbortController()
    const timeout = globalThis.setTimeout(() => request.controller?.abort(), 15_000)
    try {
      await host.patch(`/api/extensions/streams/${streamId}`, { extensionKey: extension.key, enabled: streamEnabled, config: parsed.data }, { signal: request.controller.signal, headers: { 'accept-language': locale.value } })
    } finally { globalThis.clearTimeout(timeout) }
    if (request.scope !== scopeSession || unlinkRequest.value !== request) return
    config.value = parsed.data
    toast.add({ title: () => h('span', t('successNotice')), description: () => h('span', t('mappingUnlinked')), color: 'success' })
  } catch (error: unknown) {
    if (request.scope !== scopeSession || unlinkRequest.value !== request) return
    const parsed = apiFailure(error)
    const message = parsed?.details?.find(detail => detail.message)?.message ?? parsed?.message
    toast.add({ title: () => h('span', t('unlinkFailed')), description: message ?? (() => h('span', t('unlinkFailed'))), color: 'error' })
  } finally { if (unlinkRequest.value === request) unlinkRequest.value = null }
}
watch(() => [streamId, extension.key, streamEnabled], () => {
  scopeSession += 1; unlinkRequest.value?.controller?.abort(); unlinkRequest.value = null; closeEditor(); notifiers.value = []; templateCache.value = []; loading.value = false; loadFailed.value = false; search.value = ''; pagination.value.pageIndex = 0
  void loadCatalog()
}, { immediate: true })
watch(search, () => { pagination.value.pageIndex = 0 })
onBeforeUnmount(() => { scopeSession += 1; unlinkRequest.value?.controller?.abort(); unlinkRequest.value = null; closeEditor() })
</script>

<template>
  <ExtensionAlert v-if="!streamEnabled" color="warning" :title="t('streamDisabled')" />
  <ExtensionResourceLayoutPage data-field-scope="extension.gcs-ssc-gcnotify.stream-config" data-field-container="Search and pagination are optional local notifier-list filters, not persisted configuration." v-model:search="search" v-model:pagination="pagination" :data="visibleRows" :columns="columns" :total-records="filteredRows.length" :loading="loading" :request-status="loading ? 'pending' : loadFailed && !notifiers.length ? 'error' : 'success'" :show-button="false" @retry="loadCatalog">
    <template #name-cell="{ row }">
      <div class="font-medium text-highlighted">{{ row.original.name[locale] }}</div>
      <div class="text-xs text-muted">{{ row.original.id }}</div>
    </template>
    <template #template-cell="{ row }">{{ templateName(row.original.id) }}</template>
    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <ExtensionButton icon="i-lucide-edit-3" color="neutral" variant="ghost" size="sm" :aria-label="t('editNotifier', { notifier: row.original.name[locale] })" :disabled="!streamEnabled || loading || busy" @click="openEditor(row.original)" />
        <ExtensionButton v-if="isMapped(row.original.id)" icon="i-lucide-unlink" color="error" variant="ghost" size="sm" :aria-label="t('unlinkNotifier', { notifier: row.original.name[locale] })" :disabled="!streamEnabled || loading || busy" @click="unlink(row.original)" />
      </div>
    </template>
  </ExtensionResourceLayoutPage>
  <ExtensionModal :open="editing !== null" :title="editing ? t('editNotifier', { notifier: editing.notifier.name[locale] }) : t('editMapping')" :description="t('chooseTemplateHelp')" :dismissible="!saving" :close="saving ? false : undefined" :ui="{ content: 'sm:max-w-2xl', body: 'max-h-[60vh] overflow-y-auto' }" @update:open="(value: boolean) => value ? undefined : closeEditor()">
    <template #body>
      <div v-if="editing" ref="mappingFields" class="space-y-4" data-field-scope="extension.gcs-ssc-gcnotify.stream-mapping-modal">
        <ExtensionAlert v-if="templateFailure" color="error" :title="t('templateLoadFailed')" :description="templateFailureMessage">
          <template #actions><ExtensionButton :label="t('retryTemplates')" :disabled="templatesLoading || saving" @click="loadTemplates" /></template>
        </ExtensionAlert>
        <ExtensionFormField :label="t('template')" :name="`mappings.${mappingIndex}.templateId`" :error="fieldErrors[`mappings.${mappingIndex}.templateId`]" required data-ui-target="extension.gcs-ssc-gcnotify.stream-config.template">
          <ExtensionSelectMenu :model-value="binding?.templateId" :aria-invalid="Boolean(fieldErrors[`mappings.${mappingIndex}.templateId`]) || undefined" :items="templateOptions" :placeholder="t('chooseTemplate')" :loading="templatesLoading" value-key="value" :disabled="templatesLoading || Boolean(templateFailure) || saving" required aria-required="true" @update:model-value="chooseTemplate" />
        </ExtensionFormField>
        <ExtensionAlert v-if="templateUnavailable" color="warning" :title="t('templateUnavailable')" />
        <template v-if="binding && selectedTemplate && !templateFailure">
          <template v-for="placeholder in selectedTemplate.requiredPersonalisation" :key="placeholder">
          <ExtensionFormField :label="t('mapping', { placeholder })" :name="placeholderPath(placeholder)" :error="fieldErrors[placeholderPath(placeholder)]" required data-ui-target="extension.gcs-ssc-gcnotify.stream-config.placeholder">
            <ExtensionSelectMenu :model-value="mappedFieldId(placeholder)" :aria-invalid="Boolean(fieldErrors[placeholderPath(placeholder)]) || undefined" :items="fieldOptions" value-key="value" :disabled="saving || templatesLoading" required aria-required="true" @update:model-value="setField(placeholder, $event)" />
          </ExtensionFormField>
            <ExtensionFormField v-if="needsTimeZone(placeholder)" :label="t('timeZoneFor', { placeholder })" :name="`${placeholderPath(placeholder)}.timeZone`" :error="fieldErrors[`${placeholderPath(placeholder)}.timeZone`]" required data-ui-target="extension.gcs-ssc-gcnotify.stream-config.time-zone">
              <ExtensionSelectMenu :model-value="mappedTimeZone(placeholder)" :items="timeZoneOptions" :placeholder="t('chooseTimeZone')" :aria-invalid="Boolean(fieldErrors[`${placeholderPath(placeholder)}.timeZone`]) || undefined" value-key="value" :disabled="saving || templatesLoading" required aria-required="true" @update:model-value="setTimeZone(placeholder, $event)" />
            </ExtensionFormField>
          </template>
        </template>
        <ExtensionAlert v-if="saveFailure" color="error" role="alert" :title="t('saveFailed')" :description="saveFailureMessage" />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <ExtensionButton color="neutral" variant="ghost" :label="t('cancel')" :disabled="saving" @click="closeEditor" />
        <ExtensionSaveButton :label="t('save')" type="button" :loading="saving" :disabled="!canSave" @click="save" />
      </div>
    </template>
  </ExtensionModal>
</template>
