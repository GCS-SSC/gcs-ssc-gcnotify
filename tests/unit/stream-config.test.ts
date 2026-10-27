// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { z } from 'zod'
import { flushPromises, mount } from '@vue/test-utils'
import { createExtensionTestUiRuntime } from '@gcs-ssc/extensions/testing'
import { clearExtensionUiRuntime, setExtensionUiRuntime, ExtensionAlert, ExtensionButton, ExtensionFormField, ExtensionModal, ExtensionResourceLayoutPage, ExtensionSelectMenu, type GcsExtensionConfirmDialogOptions, type GcsExtensionToastNotification } from '@gcs-ssc/extensions/ui'
import type { GcsExtensionJsonConfig } from '@gcs-ssc/extensions'
import extension from '../../extension.config'
import StreamConfig from '../../components/StreamGcNotifyConfig.vue'
const locale = ref('en')
const templateId = '33333333-3333-4333-8333-333333333333'
const otherId = '55555555-5555-4555-8555-555555555555'
const templates = [{ id: templateId, name: 'Approval email', kind: 'email', requiredPersonalisation: ['recipient'] }, { id: otherId, name: 'Alternate email', kind: 'email', requiredPersonalisation: ['recipient'] }]
const catalog = { notifiers: [{ id: 'approval.action_required', name: { en: 'Approval required', fr: 'Approbation requise' }, fields: [{ id: 'recipient_email', name: { en: 'Approval recipient email', fr: 'Courriel du destinataire de l’approbation' }, group: { id: 'approval', name: { en: 'Approval', fr: 'Approbation' } }, type: 'email' }, { id: 'recipient_name', name: { en: 'Recipient name', fr: 'Nom du destinataire' }, group: { id: 'approval', name: { en: 'Approval', fr: 'Approbation' } }, type: 'text' }, { id: 'system_date', name: { en: 'Current date', fr: 'Date actuelle' }, group: { id: 'system', name: { en: 'System', fr: 'Système' } }, type: 'date' }, { id: 'system_time', name: { en: 'Current time', fr: 'Heure actuelle' }, group: { id: 'system', name: { en: 'System', fr: 'Système' } }, type: 'time' }, { id: 'localized_name', name: { en: 'Organization name', fr: 'Nom de l’organisme' }, group: { id: 'system', name: { en: 'System', fr: 'Système' } }, type: 'localized-text' }] }, { id: 'other.host.event', name: { en: 'Other host event', fr: 'Autre notification' }, fields: [{ id: 'recipient_email', name: { en: 'Approval recipient email', fr: 'Courriel du destinataire de l’approbation' }, group: { id: 'approval', name: { en: 'Approval', fr: 'Approbation' } }, type: 'email' }, { id: 'custom_host_value', name: { en: 'Custom host value', fr: 'Valeur de l’application' }, group: { id: 'other', name: { en: 'Custom fields', fr: 'Champs personnalisés' } }, type: 'text' }] }] }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const confirmDialog = vi.fn<(options: GcsExtensionConfirmDialogOptions) => Promise<boolean>>()
const addToast = vi.fn<(notification: GcsExtensionToastNotification) => void>()
let fetcher: ReturnType<typeof vi.fn>
beforeEach(() => {
  locale.value = 'en'; addToast.mockClear(); confirmDialog.mockReset(); confirmDialog.mockResolvedValue(true)
  const runtime = createExtensionTestUiRuntime()
  runtime.composables.useI18n = () => ({ locale, n: String }); runtime.composables.useToast = () => ({ add: addToast }); runtime.composables.useConfirmDialog = () => confirmDialog
  runtime.components.CommonResourceLayoutPage = runtime.components.CommonCompactTable
  runtime.components.USelectMenu = defineComponent({
    inheritAttrs: false, emits: ['update:modelValue'],
    setup(_props, { attrs, emit }) {
      return () => {
        const { items, ...rest } = attrs
        const modelValue = attrs.modelValue ?? attrs['model-value']
        const Item = z.union([z.object({ type: z.literal('label'), label: z.string() }), z.object({ value: z.string(), label: z.string(), disabled: z.boolean().optional() })])
        const parsed = z.union([z.array(Item), z.array(z.array(Item))]).parse(items)
        const option = (item: z.infer<typeof Item>) => 'value' in item ? h('option', { value: item.value, disabled: item.disabled, selected: item.value === modelValue }, item.label) : null
        const children = parsed.map(item => Array.isArray(item) ? h('optgroup', { label: item.find(label => 'type' in label)?.label }, item.map(option)) : option(item))
        return h('select', { ...rest, value: String(modelValue ?? ''), onChange: (event: Event) => { if (event.target instanceof HTMLSelectElement) emit('update:modelValue', event.target.value) } }, children)
      }
    }
  })
  runtime.components.UAlert = defineComponent({ inheritAttrs: false, setup(_props, { attrs, slots }) { return () => h('div', attrs, [String(attrs.title ?? ''), String(attrs.description ?? ''), slots.default?.(), slots.actions?.()]) } })
  runtime.components.UModal = defineComponent({
    inheritAttrs: false, emits: ['update:open'],
    setup(_props, { attrs, emit, slots }) {
      return () => attrs.open ? h('div', { role: 'dialog', 'aria-label': String(attrs.title) }, [attrs.close === false ? undefined : h('button', { 'aria-label': 'Close', onClick: () => emit('update:open', false) }, 'Close'), slots.body?.(), slots.footer?.()]) : null
    }
  })
  setExtensionUiRuntime(runtime)
  fetcher = vi.fn().mockImplementation(async (path: string) => json(path.endsWith('/templates') ? { templates } : path.endsWith('/notifiers') ? catalog : {})); vi.stubGlobal('fetch', fetcher)
})
afterEach(() => { vi.unstubAllGlobals(); clearExtensionUiRuntime(); document.body.innerHTML = '' })
const render = (model: GcsExtensionJsonConfig = {}) => mount(StreamConfig, { attachTo: document.body, props: { streamId: '118', streamEnabled: true, extension: { ...extension, rootDir: '/test' } as never, modelValue: model } })
const edit = async (wrapper: ReturnType<typeof render>, name = 'Approval required') => { await wrapper.findAll('button').find(button => button.attributes('aria-label') === `Edit mapping for ${name}`)?.trigger('click'); await flushPromises() }
const click = async (wrapper: ReturnType<typeof render>, label: string) => { await wrapper.findAll('button').find(button => button.text() === label)?.trigger('click'); await flushPromises() }
const selectRecipientAndTemplate = async (wrapper: ReturnType<typeof render>) => { await wrapper.findAll('select')[0]?.setValue('recipient_email'); await wrapper.findAll('select')[1]?.setValue(templateId) }
const patchCalls = () => fetcher.mock.calls.filter(call => call[1]?.method === 'PATCH')
const savedMapping = { templateId, recipientEmail: 'recipient_email', notifierId: 'approval.action_required', personalisation: { recipient: 'recipient_name' } }
describe('Stream notifier table and lazy mapping modal', () => {
  it('uses the shared page table with edit icons and no global Save or inline editor', async () => {
    const wrapper = render(); await flushPromises()
    expect(wrapper.findComponent(ExtensionResourceLayoutPage).exists()).toBe(true)
    expect(wrapper.text()).toContain('Approval required'); expect(wrapper.text()).toContain('Other host event'); expect(fetcher.mock.calls.some(call => String(call[0]).endsWith('/templates'))).toBe(false)
    expect(wrapper.findAll('select')).toHaveLength(0); expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.findAllComponents(ExtensionButton).some(button => button.vm.$attrs.icon === 'i-lucide-unlink')).toBe(false)
    expect(wrapper.findAll('button').some(button => button.text() === 'Save')).toBe(false)
    const action = wrapper.findAllComponents(ExtensionButton).find(button => button.vm.$attrs['aria-label'] === 'Edit mapping for Approval required')
    expect(action?.vm.$attrs).toMatchObject({ icon: 'i-lucide-edit-3', color: 'neutral', variant: 'ghost' })
    expect(fetcher.mock.calls.every(call => !String(call[0]).includes('/agencies/'))).toBe(true)
    wrapper.unmount()
  })
  it('shows corrupt saved configuration explicitly without presenting it as unmapped or permitting edits', async () => {
    const model = { mappings: [{ ...savedMapping, personalisation: { recipient: { fieldId: 'localized_name', locale: 'de' } } }] }
    const wrapper = render(model); await flushPromises()
    expect(wrapper.findComponent(ExtensionAlert).vm.$attrs.title).toBe('The GC Notify configuration is invalid.')
    expect(wrapper.text()).not.toContain('No notification (unmapped)')
    expect(wrapper.find('[aria-label="Edit mapping for Approval required"]').attributes('disabled')).toBeDefined()
    await edit(wrapper); expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(patchCalls()).toHaveLength(0); expect(wrapper.emitted('update:modelValue')).toBeUndefined(); expect(wrapper.props('modelValue')).toEqual(model)
    locale.value = 'fr'; await flushPromises(); expect(wrapper.findComponent(ExtensionAlert).vm.$attrs.title).toBe('La configuration de Notification GC n’est pas valide.')
    wrapper.unmount()
  })
  it('opens the canonical medium modal and leaves the saved model and API untouched on Cancel', async () => {
    const wrapper = render(); await flushPromises(); await edit(wrapper)
    expect(wrapper.find('[role="dialog"]').attributes('aria-label')).toBe('Edit mapping for Approval required')
    expect(wrapper.findComponent(ExtensionModal).vm.$attrs.ui).toEqual({ content: 'sm:max-w-2xl', body: 'max-h-[min(60vh,32rem)] overflow-y-auto' })
    await selectRecipientAndTemplate(wrapper); await wrapper.findAll('select')[2]?.setValue('recipient_name')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined(); expect(patchCalls()).toHaveLength(0)
    await click(wrapper, 'Cancel')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false); expect(wrapper.emitted('update:modelValue')).toBeUndefined(); expect(patchCalls()).toHaveLength(0)
    await edit(wrapper); expect(wrapper.findAll('select')).toHaveLength(2)
    wrapper.unmount()
  })
  it('persists the modal draft once, closes it, and emits reactive title and body success feedback', async () => {
    const wrapper = render(); await flushPromises(); await edit(wrapper)
    await selectRecipientAndTemplate(wrapper); await wrapper.findAll('select')[2]?.setValue('recipient_name')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    const field = wrapper.findAllComponents(ExtensionFormField)[2]
    expect(field?.vm.$attrs.required).toBeDefined(); expect(wrapper.findAllComponents(ExtensionSelectMenu)[2]?.vm.$attrs['aria-required']).toBe('true')
    await click(wrapper, 'Save')
    expect(JSON.parse(patchCalls()[0]?.[1].body)).toEqual({ extensionKey: extension.key, enabled: true, config: { mappings: [savedMapping] } })
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual({ mappings: [savedMapping] }); expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    const notice = addToast.mock.calls[0]?.[0]; expect(notice?.color).toBe('success')
    if (typeof notice?.title === 'function') expect(notice.title().children).toBe('Success')
    if (typeof notice?.description === 'function') expect(notice.description().children).toBe('Notification mappings saved.')
    locale.value = 'fr'; await flushPromises()
    if (typeof notice?.title === 'function') expect(notice.title().children).toBe('Succès')
    if (typeof notice?.description === 'function') expect(notice.description().children).toBe('Correspondances de notification enregistrées.')
    wrapper.unmount()
  })
  it('keeps the notifier fixed and replaces only its binding when choosing another template', async () => {
    const other = { templateId, recipientEmail: 'recipient_email', notifierId: 'other.host.event', personalisation: { recipient: 'custom_host_value' } }
    const wrapper = render({ mappings: [savedMapping, other] }); await flushPromises(); await edit(wrapper)
    expect(wrapper.findAll('select')).toHaveLength(3)
    expect(wrapper.findAll('select')[2]?.text()).toContain('Recipient name')
    expect(wrapper.findAll('select')[2]?.text()).not.toContain('Custom host value')
    await wrapper.findAll('select')[1]?.setValue(otherId)
    expect(wrapper.findAll('select')[2]?.element.value).not.toBe('recipient_name')
    await wrapper.findAll('select')[2]?.setValue('recipient_name'); await click(wrapper, 'Save')
    expect(JSON.parse(patchCalls()[0]?.[1].body).config).toEqual({ mappings: [other, { ...savedMapping, templateId: otherId }] })
    wrapper.unmount()
  })
  it('groups host fields from bilingual metadata and requires a time zone for date and time bindings', async () => {
    const wrapper = render(); await flushPromises(); await edit(wrapper); await selectRecipientAndTemplate(wrapper)
    expect(wrapper.findAll('select')[2]?.findAll('optgroup').map(group => group.attributes('label'))).toEqual(['Approval', 'System'])
    await wrapper.findAll('select')[2]?.setValue('system_date')
    expect(wrapper.findAll('select')).toHaveLength(5)
    expect(wrapper.findAll('select')[4]?.element.value).toBe('')
    expect(wrapper.findAllComponents(ExtensionFormField)[4]?.vm.$attrs).toMatchObject({ name: 'mappings.0.personalisation.recipient.timeZone', label: 'Time zone for recipient' })
    expect(wrapper.findAllComponents(ExtensionSelectMenu)[4]?.vm.$attrs['aria-required']).toBe('true')
    fetcher.mockResolvedValueOnce(json({ data: { message: 'Choose a time zone.', details: [{ path: 'mappings.0.personalisation.recipient.timeZone', message: 'Choose a time zone.' }] } }, 400))
    await click(wrapper, 'Save')
    expect(document.activeElement).toBe(wrapper.findAll('select')[4]?.element)
    await wrapper.findAll('select')[4]?.setValue('America/Toronto')
    await wrapper.findAll('select')[2]?.setValue('system_time')
    expect(wrapper.findAll('select')[4]?.element.value).toBe('')
    await wrapper.findAll('select')[4]?.setValue('America/Vancouver'); await wrapper.findAll('select')[3]?.setValue('fr'); locale.value = 'fr'; await flushPromises()
    expect(wrapper.findAll('select')[2]?.findAll('optgroup').map(group => group.attributes('label'))).toEqual(['Approbation', 'Système'])
    expect(wrapper.findAllComponents(ExtensionFormField)[4]?.vm.$attrs.label).toBe('Fuseau horaire pour recipient')
    await click(wrapper, 'Enregistrer')
    expect(JSON.parse(patchCalls()[1]?.[1].body).config).toEqual({ mappings: [{ ...savedMapping, personalisation: { recipient: { fieldId: 'system_time', timeZone: 'America/Vancouver', locale: 'fr' } } }] })
    wrapper.unmount()
  })
  it('keeps timezone edits isolated from saved configuration when cancelling', async () => {
    const model = { mappings: [{ ...savedMapping, personalisation: { recipient: { fieldId: 'system_date', timeZone: 'UTC' } } }] }
    const wrapper = render(model); await flushPromises(); await edit(wrapper)
    await wrapper.findAll('select')[4]?.setValue('America/Toronto'); await click(wrapper, 'Cancel')
    expect(model.mappings[0]?.personalisation.recipient.timeZone).toBe('UTC')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined(); expect(patchCalls()).toHaveLength(0)
    await edit(wrapper); expect(wrapper.findAll('select')[4]?.element.value).toBe('UTC'); await click(wrapper, 'Cancel')
    await edit(wrapper, 'Other host event'); await selectRecipientAndTemplate(wrapper); await wrapper.findAll('select')[2]?.setValue('custom_host_value'); await click(wrapper, 'Save')
    expect(JSON.parse(patchCalls()[0]?.[1].body).config.mappings[0].personalisation.recipient.timeZone).toBe('UTC'); wrapper.unmount()
  })
  it('hydrates a saved time zone and removes it when a text field is selected', async () => {
    const wrapper = render({ mappings: [{ ...savedMapping, personalisation: { recipient: { fieldId: 'system_date', timeZone: 'Asia/Kolkata' } } }] }); await flushPromises(); await edit(wrapper)
    expect(wrapper.findAll('select')[2]?.element.value).toBe('system_date'); expect(wrapper.findAll('select')[4]?.element.value).toBe('Asia/Kolkata')
    await wrapper.findAll('select')[2]?.setValue('recipient_name'); expect(wrapper.findAll('select')).toHaveLength(3)
    await click(wrapper, 'Save'); expect(JSON.parse(patchCalls()[0]?.[1].body).config).toEqual({ mappings: [savedMapping] }); wrapper.unmount()
  })
  it('repairs a legacy localized name with an explicit language and associated field errors', async () => {
    const wrapper = render({ mappings: [{ ...savedMapping, personalisation: { recipient: 'localized_name' } }] }); await flushPromises(); await edit(wrapper)
    expect(wrapper.findAll('select')[2]?.element.value).toBe('localized_name')
    expect(wrapper.findAll('select')[3]?.element.value).toBe('')
    expect(wrapper.findAllComponents(ExtensionFormField)[3]?.vm.$attrs).toMatchObject({ name: 'mappings.0.personalisation.recipient.locale', label: 'Language for recipient' })
    expect(wrapper.findAllComponents(ExtensionSelectMenu)[3]?.vm.$attrs['aria-required']).toBe('true')
    fetcher.mockResolvedValueOnce(json({ data: { message: 'Choose a language.', details: [{ path: 'mappings.0.personalisation.recipient.locale', message: 'Choose a language.' }] } }, 400))
    await click(wrapper, 'Save'); expect(document.activeElement).toBe(wrapper.findAll('select')[3]?.element)
    expect(wrapper.findAllComponents(ExtensionSelectMenu)[3]?.vm.$attrs['aria-invalid']).toBe(true)
    await wrapper.findAll('select')[3]?.setValue('fr'); await click(wrapper, 'Save')
    expect(JSON.parse(patchCalls()[1]?.[1].body).config.mappings[0].personalisation.recipient).toEqual({ fieldId: 'localized_name', locale: 'fr' })
    wrapper.unmount()
  })
  it('preserves the time zone while changing language and keeps both draft choices isolated on Cancel', async () => {
    const model = { mappings: [{ ...savedMapping, personalisation: { recipient: { fieldId: 'system_date', timeZone: 'UTC', locale: 'en' } } }] }
    const wrapper = render(model); await flushPromises(); await edit(wrapper)
    expect(wrapper.findAll('select')[3]?.element.value).toBe('en'); expect(wrapper.findAll('select')[4]?.element.value).toBe('UTC')
    await wrapper.findAll('select')[3]?.setValue('fr'); expect(wrapper.findAll('select')[4]?.element.value).toBe('UTC')
    await wrapper.findAll('select')[3]?.setValue(''); expect(wrapper.findAll('select')[3]?.element.value).toBe(''); expect(wrapper.findAll('select')[4]?.element.value).toBe('UTC')
    await wrapper.findAll('select')[3]?.setValue('fr')
    await wrapper.findAll('select')[4]?.setValue('America/Toronto'); expect(wrapper.findAll('select')[3]?.element.value).toBe('fr')
    await click(wrapper, 'Cancel'); expect(model.mappings[0]?.personalisation.recipient).toEqual({ fieldId: 'system_date', timeZone: 'UTC', locale: 'en' })
    await edit(wrapper); expect(wrapper.findAll('select')[3]?.element.value).toBe('en'); expect(wrapper.findAll('select')[4]?.element.value).toBe('UTC')
    locale.value = 'fr'; await flushPromises(); expect(wrapper.findAllComponents(ExtensionFormField)[3]?.vm.$attrs.label).toBe('Langue pour recipient')
    expect(wrapper.findAllComponents(ExtensionFormField)[0]?.vm.$attrs.description).toContain('Une valeur vide empêche l’envoi.')
    await wrapper.findAll('select')[2]?.setValue('recipient_name'); expect(wrapper.findAll('select')).toHaveLength(3)
    wrapper.unmount()
  })
  it('requires an explicit email-only recipient and repairs the indexed API error', async () => {
    const legacy = { templateId, notifierId: 'approval.action_required', personalisation: savedMapping.personalisation }
    const wrapper = render({ mappings: [legacy] }); await flushPromises(); await edit(wrapper)
    expect(wrapper.findAll('select')[0]?.element.value).toBe('')
    expect(wrapper.findAll('select')[0]?.text()).toContain('Approval recipient email')
    expect(wrapper.findAll('select')[0]?.text()).not.toContain('Recipient name')
    expect(wrapper.findAll('select')[0]?.text()).not.toContain('Current date')
    expect(wrapper.findAllComponents(ExtensionFormField)[0]?.vm.$attrs).toMatchObject({ name: 'mappings.0.recipientEmail', label: 'Recipient email', description: 'Choose the host field that supplies the recipient email address. An empty value prevents sending.' })
    expect(wrapper.findAllComponents(ExtensionSelectMenu)[0]?.vm.$attrs['aria-required']).toBe('true')
    fetcher.mockResolvedValueOnce(json({ data: { message: 'Choose recipient email.', details: [{ path: 'mappings.0.recipientEmail', message: 'Choose recipient email.' }] } }, 400))
    await click(wrapper, 'Save'); expect(document.activeElement).toBe(wrapper.findAll('select')[0]?.element)
    expect(wrapper.findAllComponents(ExtensionSelectMenu)[0]?.vm.$attrs['aria-invalid']).toBe(true)
    await wrapper.findAll('select')[0]?.setValue('recipient_email'); await click(wrapper, 'Save')
    expect(JSON.parse(patchCalls()[1]?.[1].body).config.mappings[0].recipientEmail).toBe('recipient_email')
    wrapper.unmount()
  })
  it('discards a recipient draft on Cancel and keeps a legacy missing recipient blank when reopened', async () => {
    const legacy = { templateId, notifierId: 'approval.action_required', personalisation: savedMapping.personalisation }
    const wrapper = render({ mappings: [legacy] }); await flushPromises(); await edit(wrapper)
    await wrapper.findAll('select')[0]?.setValue('recipient_email'); await click(wrapper, 'Cancel')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined(); expect(patchCalls()).toHaveLength(0)
    await edit(wrapper); expect(wrapper.findAll('select')[0]?.element.value).toBe('')
    locale.value = 'fr'; await flushPromises(); expect(wrapper.findAllComponents(ExtensionFormField)[0]?.vm.$attrs.label).toBe('Courriel du destinataire')
    wrapper.unmount()
  })
  it('confirms table unlink without loading templates and preserves other bindings', async () => {
    const other = { templateId, recipientEmail: 'recipient_email', notifierId: 'other.host.event', personalisation: { recipient: 'custom_host_value' } }
    const wrapper = render({ mappings: [savedMapping, other] }); await flushPromises()
    const action = wrapper.findAllComponents(ExtensionButton).find(button => button.vm.$attrs['aria-label'] === 'Unlink template from Approval required')
    expect(action?.vm.$attrs).toMatchObject({ icon: 'i-lucide-unlink', color: 'error', variant: 'ghost', size: 'sm' })
    const unlink = () => wrapper.find('[aria-label="Unlink template from Approval required"]').trigger('click')
    confirmDialog.mockResolvedValueOnce(false); await unlink(); await flushPromises()
    expect(patchCalls()).toHaveLength(0); expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Unlink template?', description: expect.stringContaining('Approval required'), confirmLabel: 'Unlink', cancelLabel: 'Cancel', confirmColor: 'error' }))
    await unlink(); await flushPromises()
    expect(JSON.parse(patchCalls()[0]?.[1].body).config).toEqual({ mappings: [other] })
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual({ mappings: [other] })
    expect(wrapper.find('[aria-label="Unlink template from Approval required"]').exists()).toBe(false)
    expect(fetcher.mock.calls.some(call => String(call[0]).endsWith('/templates'))).toBe(false)
    const notice = addToast.mock.calls[0]?.[0]
    if (typeof notice?.title === 'function') expect(notice.title().children).toBe('Success')
    if (typeof notice?.description === 'function') expect(notice.description().children).toBe('Template mapping removed.')
    locale.value = 'fr'; await flushPromises()
    if (typeof notice?.title === 'function') expect(notice.title().children).toBe('Succès')
    if (typeof notice?.description === 'function') expect(notice.description().children).toBe('Correspondance du modèle supprimée.')
    expect(wrapper.find('[aria-label="Modifier la correspondance : Approbation requise"]').exists()).toBe(true)
    confirmDialog.mockResolvedValueOnce(false)
    await wrapper.find('[aria-label="Dissocier le modèle : Autre notification"]').trigger('click'); await flushPromises()
    expect(confirmDialog).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Dissocier le modèle?', description: expect.stringContaining('Autre notification'), confirmLabel: 'Dissocier', cancelLabel: 'Annuler' }))
    expect(patchCalls()).toHaveLength(1)
    wrapper.unmount()
  })
  it('keeps a failed unlink mapped and allows a confirmed retry', async () => {
    const wrapper = render({ mappings: [savedMapping] }); await flushPromises()
    fetcher.mockResolvedValueOnce(json({ data: { message: 'Try again.' } }, 500))
    await wrapper.find('[aria-label="Unlink template from Approval required"]').trigger('click'); await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined(); expect(wrapper.props('modelValue')).toEqual({ mappings: [savedMapping] })
    expect(addToast.mock.calls[0]?.[0]).toMatchObject({ color: 'error', description: 'Try again.' })
    await wrapper.find('[aria-label="Unlink template from Approval required"]').trigger('click'); await flushPromises()
    expect(patchCalls()).toHaveLength(2); expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual({ mappings: [] }); wrapper.unmount()
  })
  it('blocks edits during unlink and discards confirmation after a Stream change', async () => {
    const wrapper = render({ mappings: [savedMapping] }); await flushPromises()
    let approve: (value: boolean) => void = () => undefined
    confirmDialog.mockImplementationOnce(() => new Promise<boolean>(resolve => { approve = resolve }))
    await wrapper.find('[aria-label="Unlink template from Approval required"]').trigger('click'); await flushPromises()
    expect(wrapper.find('[aria-label="Edit mapping for Approval required"]').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ streamId: '119', modelValue: {} }); await flushPromises()
    approve(true); await flushPromises(); expect(patchCalls()).toHaveLength(0); expect(addToast).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('ignores an older unlink response after the Stream changes', async () => {
    const wrapper = render({ mappings: [savedMapping] }); await flushPromises()
    let complete: (value: Response) => void = () => undefined
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve }))
    await wrapper.find('[aria-label="Unlink template from Approval required"]').trigger('click'); await flushPromises()
    await wrapper.setProps({ streamId: '119', modelValue: {} }); await flushPromises()
    complete(json({})); await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined(); expect(addToast).not.toHaveBeenCalled(); wrapper.unmount()
  })
  it('keeps structured required-field failures inside the modal and repairs the same draft', async () => {
    const wrapper = render(); await flushPromises(); await edit(wrapper); await selectRecipientAndTemplate(wrapper)
    fetcher.mockResolvedValueOnce(json({ data: { message: 'Map required values.', details: [{ path: 'mappings.0.personalisation.recipient', message: 'Choose a recipient field.' }] } }, 400))
    await click(wrapper, 'Save')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true); expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.findComponent(ExtensionAlert).vm.$attrs.description).toBe('Choose a recipient field.')
    expect(wrapper.findAllComponents(ExtensionFormField)[2]?.vm.$attrs).toMatchObject({ name: 'mappings.0.personalisation.recipient', error: 'Choose a recipient field.' })
    expect(wrapper.findAllComponents(ExtensionSelectMenu)[2]?.vm.$attrs['aria-invalid']).toBe(true); expect(document.activeElement).toBe(wrapper.findAll('select')[2]?.element)
    await wrapper.findAll('select')[2]?.setValue('recipient_name'); await click(wrapper, 'Save')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false); expect(JSON.parse(patchCalls()[1]?.[1].body).config).toEqual({ mappings: [savedMapping] })
    wrapper.unmount()
  })
  it('does not move the modal to another template when the server rejects another mapping', async () => {
    const other = { templateId: otherId, recipientEmail: 'recipient_email', notifierId: 'other.host.event', personalisation: { recipient: 'custom_host_value' } }
    const wrapper = render({ mappings: [savedMapping, other] }); await flushPromises(); await edit(wrapper)
    fetcher.mockResolvedValueOnce(json({ data: { message: 'Other mapping requires repair.', details: [{ path: 'mappings.0.personalisation.recipient', message: 'Repair the other template.' }] } }, 400))
    await click(wrapper, 'Save')
    expect(wrapper.find('[role="dialog"]').attributes('aria-label')).toBe('Edit mapping for Approval required')
    expect(wrapper.findComponent(ExtensionAlert).vm.$attrs.description).toBe('Repair the other template.')
    expect(wrapper.findAll('select')[2]?.element.value).toBe('recipient_name'); expect(wrapper.props('modelValue')).toEqual({ mappings: [savedMapping, other] })
    wrapper.unmount()
  })
  it('blocks pending modal dismissal and ignores the older save after changing Stream', async () => {
    const wrapper = render({ mappings: [savedMapping] }); await flushPromises(); await edit(wrapper)
    let complete: (value: Response) => void = () => undefined
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve }))
    await click(wrapper, 'Save')
    expect(wrapper.find('[aria-label="Unlink template from Approval required"]').attributes('disabled')).toBeDefined()
    expect(wrapper.findComponent(ExtensionModal).vm.$attrs.close).toBe(false); expect(wrapper.find('[aria-label="Close"]').exists()).toBe(false)
    expect(wrapper.findAll('button').find(button => button.text() === 'Cancel')?.element.disabled).toBe(true)
    await wrapper.setProps({ streamId: '119', modelValue: {} }); await flushPromises(); await edit(wrapper, 'Other host event')
    complete(json({})); await flushPromises()
    expect(wrapper.find('[role="dialog"]').attributes('aria-label')).toBe('Edit mapping for Other host event'); expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined(); expect(addToast).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('closes and discards the draft on Stream changes and rejects stale template loading', async () => {
    const wrapper = render({ mappings: [savedMapping] }); await flushPromises(); await edit(wrapper)
    await wrapper.findAll('select')[2]?.setValue('recipient_name')
    await wrapper.setProps({ streamId: '119', modelValue: {}, streamEnabled: false }); await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false); expect(wrapper.emitted('update:modelValue')).toBeUndefined(); expect(patchCalls()).toHaveLength(0)
    expect(wrapper.findComponent(ExtensionAlert).vm.$attrs.title).toContain('Enable GC Notify for this Stream')
    wrapper.unmount()
  })
  it('shows an unavailable saved template without offering modal unlink', async () => {
    const missing = { ...savedMapping, templateId: '66666666-6666-4666-8666-666666666666' }
    const wrapper = render({ mappings: [missing] }); await flushPromises(); await edit(wrapper)
    expect(wrapper.findAllComponents(ExtensionAlert).some(alert => String(alert.vm.$attrs.title).includes('unavailable'))).toBe(true)
    expect(wrapper.findAll('button').find(button => button.text() === 'Save')?.element.disabled).toBe(true)
    expect(wrapper.find('[role="dialog"]').findAll('button').some(button => /Remove|Unlink|Dissocier/.test(button.text()))).toBe(false)
    await click(wrapper, 'Cancel'); expect(patchCalls()).toHaveLength(0); wrapper.unmount()
  })
  it('loads templates only when opened, retries failure, and ignores a closed modal response', async () => {
    const wrapper = render(); await flushPromises()
    fetcher.mockRejectedValueOnce(new Error('offline')); await edit(wrapper)
    expect(wrapper.findAll('button').find(button => button.text() === 'Save')?.element.disabled).toBe(true)
    await click(wrapper, 'Retry templates')
    expect(wrapper.findAll('select')[1]?.text()).toContain('Approval email')
    await click(wrapper, 'Cancel')
    let complete: (value: Response) => void = () => undefined
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve }))
    await edit(wrapper); expect(wrapper.findAllComponents(ExtensionSelectMenu)[1]?.vm.$attrs.loading).toBe(true)
    await click(wrapper, 'Cancel'); await edit(wrapper, 'Other host event')
    complete(json({ templates: [{ ...templates[0], name: 'STALE TEMPLATE' }] })); await flushPromises()
    expect(wrapper.find('[role="dialog"]').attributes('aria-label')).toBe('Edit mapping for Other host event')
    expect(wrapper.text()).not.toContain('STALE TEMPLATE'); expect(patchCalls()).toHaveLength(0); wrapper.unmount()
  })
  it('discards an old Stream template response before opening the replacement scope', async () => {
    const wrapper = render(); await flushPromises()
    let complete: (value: Response) => void = () => undefined
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve }))
    await edit(wrapper)
    await wrapper.setProps({ streamId: '119' }); await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    await edit(wrapper)
    complete(json({ templates: [{ ...templates[0], name: 'WRONG STREAM TEMPLATE' }] })); await flushPromises()
    expect(wrapper.findAll('select')[1]?.text()).toContain('Approval email')
    expect(wrapper.text()).not.toContain('WRONG STREAM TEMPLATE'); expect(patchCalls()).toHaveLength(0)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined(); wrapper.unmount()
  })
  it('retranslates modal labels and shows ordinary save failure without losing the draft', async () => {
    const wrapper = render({ mappings: [savedMapping] }); await flushPromises(); await edit(wrapper)
    fetcher.mockResolvedValueOnce(json({}, 500)); await click(wrapper, 'Save')
    expect(wrapper.findComponent(ExtensionAlert).vm.$attrs.title).toBe('Notification mappings could not be saved.')
    locale.value = 'fr'; await flushPromises()
    expect(wrapper.find('[role="dialog"]').attributes('aria-label')).toBe('Modifier la correspondance : Approbation requise')
    expect(wrapper.findComponent(ExtensionAlert).vm.$attrs.title).toBe('Impossible d’enregistrer les correspondances de notification.')
    expect(wrapper.findAll('button').some(button => button.text() === 'Annuler')).toBe(true); expect(wrapper.findAll('button').some(button => button.text() === 'Enregistrer')).toBe(true)
    wrapper.unmount()
  })
})
