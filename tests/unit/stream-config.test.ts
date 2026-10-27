// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { z } from 'zod'
import { flushPromises, mount } from '@vue/test-utils'
import { createExtensionTestUiRuntime } from '@gcs-ssc/extensions/testing'
import { clearExtensionUiRuntime, setExtensionUiRuntime, ExtensionAlert, ExtensionButton, ExtensionFormField, ExtensionSaveButton, ExtensionSelectMenu } from '@gcs-ssc/extensions/ui'
import type { GcsExtensionJsonConfig } from '@gcs-ssc/extensions'
import extension from '../../extension.config'
import StreamConfig from '../../components/StreamGcNotifyConfig.vue'
const locale = ref('en')
const templateId = '33333333-3333-4333-8333-333333333333'
const otherId = '55555555-5555-4555-8555-555555555555'
const templates = [{ id: templateId, name: 'Approval email', kind: 'email', requiredPersonalisation: ['recipient'] }, { id: otherId, name: 'Alternate email', kind: 'email', requiredPersonalisation: ['recipient'] }]
const catalog = { notifiers: [{ id: 'approval.action_required', name: { en: 'Approval required', fr: 'Approbation requise' }, fields: [{ id: 'recipient_name', name: { en: 'Recipient name', fr: 'Nom du destinataire' } }] }, { id: 'other.host.event', name: { en: 'Other host event', fr: 'Autre notification' }, fields: [{ id: 'custom_host_value', name: { en: 'Custom host value', fr: 'Valeur de l’application' } }] }] }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
let fetcher: ReturnType<typeof vi.fn>
beforeEach(() => {
  locale.value = 'en'; const runtime = createExtensionTestUiRuntime(); runtime.composables.useI18n = () => ({ locale, n: String }); runtime.components.CommonResourceLayoutCard = runtime.components.CommonCompactTable
  runtime.components.USelectMenu = defineComponent({
    inheritAttrs: false, emits: ['update:modelValue'],
    setup(_props, { attrs, emit }) {
      return () => {
        const { modelValue, items, ...rest } = attrs
        const options = z.array(z.object({ value: z.string(), label: z.string(), disabled: z.boolean().optional() })).parse(items)
        return h('select', { ...rest, value: String(modelValue ?? ''), onChange: (event: Event) => { if (event.target instanceof HTMLSelectElement) emit('update:modelValue', event.target.value) } }, options.map(option => h('option', { value: option.value, disabled: option.disabled }, option.label)))
      }
    }
  })
  setExtensionUiRuntime(runtime)
  fetcher = vi.fn().mockImplementation(async (path: string) => json(path.endsWith('/templates') ? { templates } : path.endsWith('/notifiers') ? catalog : {})); vi.stubGlobal('fetch', fetcher)
})
afterEach(() => { vi.unstubAllGlobals(); clearExtensionUiRuntime(); document.body.innerHTML = '' })
const render = (model: GcsExtensionJsonConfig = {}) => mount(StreamConfig, { attachTo: document.body, props: { streamId: '118', streamEnabled: true, extension: { ...extension, rootDir: '/test' } as never, modelValue: model } })
const applyModel = async (wrapper: ReturnType<typeof render>) => { const model = wrapper.emitted('update:modelValue')?.at(-1)?.[0]; if (model) await wrapper.setProps({ modelValue: model as GcsExtensionJsonConfig }) }
const configure = async (wrapper: ReturnType<typeof render>, name = 'Approval email') => { await wrapper.findAll('button').find(button => button.attributes('aria-label') === `Configure ${name}`)?.trigger('click'); await flushPromises() }
describe('Stream template-first configuration', () => {
  it('lists actual template names without expanding unmapped rows or exposing keys', async () => {
    const wrapper = render(); await flushPromises()
    expect(wrapper.text()).toContain('Approval email'); expect(wrapper.text()).toContain('Alternate email'); expect(wrapper.findAll('select')).toHaveLength(0); expect(wrapper.findAll('input')).toHaveLength(0)
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([expect.stringContaining('/streams/118/templates'), '/api/extensions/streams/118/notifiers']))
    expect(fetcher.mock.calls.every(call => !String(call[0]).includes('/agencies/'))).toBe(true)
    wrapper.unmount()
  })
  it('moves user Configure activation into the existing notifier control and keeps the mobile toolbar responsive', async () => {
    const wrapper = render(); await flushPromises(); await configure(wrapper)
    expect(document.activeElement).toBe(wrapper.find('select').element)
    expect(wrapper.findAllComponents(ExtensionButton).filter(button => button.vm.$attrs['aria-pressed'] === true)).toHaveLength(1)
    expect(wrapper.findComponent(ExtensionSaveButton).vm.$attrs.class).toContain('w-full')
    expect(wrapper.findComponent(ExtensionSaveButton).vm.$attrs.class).toContain('sm:w-auto')
    locale.value = 'fr'; await flushPromises()
    expect(wrapper.findComponent(ExtensionSaveButton).vm.$attrs.label).toBe('Enregistrer')
    wrapper.unmount()
  })
  it('selects a template, chooses host notifier, maps required fields and self-saves Stream JSON', async () => {
    const wrapper = render(); await flushPromises(); await configure(wrapper)
    expect(wrapper.findAll('select')).toHaveLength(1)
    await wrapper.find('select').setValue('approval.action_required'); await applyModel(wrapper)
    expect(wrapper.findAll('select')).toHaveLength(2)
    await wrapper.findAll('select')[1]?.setValue('recipient_name'); await applyModel(wrapper)
    const expected = { mappings: [{ templateId, notifierId: 'approval.action_required', personalisation: { recipient: 'recipient_name' } }] }
    expect(wrapper.props('modelValue')).toEqual(expected)
    const field = wrapper.findAllComponents(ExtensionFormField).find(item => item.attributes('data-ui-target')?.endsWith('.placeholder'))
    expect(field?.attributes('required')).toBeDefined(); expect(wrapper.findAllComponents(ExtensionSelectMenu)[1]?.vm.$attrs['aria-required']).toBe('true')
    await wrapper.findAll('button').find(button => button.text() === 'Save notification mappings')?.trigger('click'); await flushPromises()
    expect(fetcher).toHaveBeenCalledWith('/api/extensions/streams/118', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ extensionKey: extension.key, enabled: true, config: expected }) }))
    expect(wrapper.text()).toContain('Saved.')
    locale.value = 'fr'; await flushPromises(); expect(wrapper.text()).toContain('Enregistré.'); expect(wrapper.text()).toContain('Notification de l’application')
    wrapper.unmount()
  })
  it('uses arbitrary host catalog identifiers and permits one template for different notifiers', async () => {
    const first = { templateId, notifierId: 'approval.action_required', personalisation: { recipient: 'recipient_name' } }
    const wrapper = render({ mappings: [first] }); await flushPromises(); await configure(wrapper)
    await wrapper.find('select').setValue('other.host.event'); await applyModel(wrapper)
    await wrapper.findAll('select')[1]?.setValue('custom_host_value'); await applyModel(wrapper)
    expect(wrapper.props('modelValue')).toEqual({ mappings: [first, { templateId, notifierId: 'other.host.event', personalisation: { recipient: 'custom_host_value' } }] })
    await wrapper.findAll('button').find(button => button.text() === 'Remove mapping')?.trigger('click'); await applyModel(wrapper)
    expect(wrapper.props('modelValue')).toEqual({ mappings: [first] })
    await wrapper.findAll('button').find(button => button.text() === 'Save notification mappings')?.trigger('click'); await flushPromises()
    expect(fetcher).toHaveBeenCalledWith('/api/extensions/streams/118', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ extensionKey: extension.key, enabled: true, config: { mappings: [first] } }) }))
    wrapper.unmount()
  })
  it('preserves saved missing-template mappings across remote errors and allows clearing', async () => {
    const mapping = { templateId: '66666666-6666-4666-8666-666666666666', notifierId: 'approval.action_required', personalisation: { recipient: 'recipient_name' } }
    fetcher.mockRejectedValue(new Error('offline'))
    const wrapper = render({ mappings: [mapping] }); await flushPromises()
    expect(wrapper.text()).toContain('This saved template is unavailable'); expect(wrapper.text()).toContain('Unable to complete')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
  it('isolates Stream changes and ignores stale remote requests', async () => {
    let complete: (response: Response) => void = () => undefined
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve }))
    const wrapper = render(); await wrapper.setProps({ streamId: '119', modelValue: {} }); await flushPromises(); await wrapper.setProps({ streamEnabled: false }); await flushPromises()
    complete(json({ templates })); await flushPromises()
    expect(wrapper.find('[title]').attributes('title')).toContain('Enable GC Notify for this Stream'); expect(wrapper.text()).not.toContain('Approval email'); expect(wrapper.findAll('button').every(button => button.element.disabled)).toBe(true)
    wrapper.unmount()
  })
  it('associates structured missing-placeholder errors with the control and repairs the saved draft', async () => {
    const mapping = { templateId, notifierId: 'approval.action_required', personalisation: {} }
    const wrapper = render({ mappings: [mapping] }); await flushPromises(); await configure(wrapper)
    fetcher.mockResolvedValueOnce(json({ data: { message: 'Map all required placeholders.', details: [{ path: 'mappings.0.personalisation.recipient', message: 'Choose a recipient field.' }] } }, 400))
    await wrapper.findAll('button').find(button => button.text() === 'Save notification mappings')?.trigger('click'); await flushPromises()
    expect(wrapper.findComponent(ExtensionAlert).vm.$attrs.description).toBe('Choose a recipient field.')
    expect(wrapper.findAllComponents(ExtensionFormField)[1]?.vm.$attrs.error).toBe('Choose a recipient field.')
    expect(wrapper.findAllComponents(ExtensionFormField)[1]?.vm.$attrs.name).toBe('mappings.0.personalisation.recipient')
    expect(wrapper.findAllComponents(ExtensionSelectMenu)[1]?.vm.$attrs['aria-invalid']).toBe(true)
    expect(document.activeElement).toBe(wrapper.findAll('select')[1]?.element)
    expect(wrapper.text()).toContain('Approval email'); expect(wrapper.text()).toContain('Alternate email')
    await wrapper.findAll('select')[1]?.setValue('recipient_name'); await applyModel(wrapper)
    expect(wrapper.findAllComponents(ExtensionSelectMenu)[1]?.vm.$attrs['aria-invalid']).toBeUndefined()
    await wrapper.findAll('button').find(button => button.text() === 'Save notification mappings')?.trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('Saved.'); expect(wrapper.findAllComponents(ExtensionAlert)).toHaveLength(0)
    wrapper.unmount()
  })
  it('retains mapping drafts and translated retry feedback after a failed save', async () => {
    const mapping = { templateId, notifierId: 'approval.action_required', personalisation: { recipient: 'recipient_name' } }
    const wrapper = render({ mappings: [mapping] }); await flushPromises()
    fetcher.mockResolvedValueOnce(json({}, 400))
    await wrapper.findAll('button').find(button => button.text() === 'Save notification mappings')?.trigger('click'); await flushPromises()
    expect(wrapper.props('modelValue')).toEqual({ mappings: [mapping] }); expect(wrapper.findComponent(ExtensionAlert).vm.$attrs.title).toBe('Notification mappings could not be saved.')
    locale.value = 'fr'; await flushPromises(); expect(wrapper.findComponent(ExtensionAlert).vm.$attrs.title).toBe('Impossible d’enregistrer les correspondances de notification.')
    wrapper.unmount()
  })
})
