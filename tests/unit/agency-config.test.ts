// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createExtensionTestUiRuntime } from '@gcs-ssc/extensions/testing'
import { clearExtensionUiRuntime, setExtensionUiRuntime, ExtensionFormField, ExtensionSelectMenu, ExtensionInput, ExtensionSaveButton } from '@gcs-ssc/extensions/ui'
import type { GcsExtensionJsonConfig } from '@gcs-ssc/extensions'
import config from '../../extension.config'
import AgencyConfig from '../../components/AgencyGcNotifyConfig.vue'
const locale = ref('en')
const templateId = '33333333-3333-4333-8333-333333333333'
const template = { id: templateId, name: 'Bilingual', kind: 'email', requiredPersonalisation: ['recipient'] }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
let fetcher: ReturnType<typeof vi.fn>
beforeEach(() => {
  locale.value = 'en'
  const runtime = createExtensionTestUiRuntime()
  runtime.composables.useI18n = () => ({ locale, n: String })
  setExtensionUiRuntime(runtime)
  fetcher = vi.fn().mockImplementation(async (path: string) => {
    if (path.endsWith('/notifiers')) return json({ notifiers: [{ id: 'approval.action_required', name: { en: 'Approval', fr: 'Approbation' }, fields: [{ id: 'recipient_name', name: { en: 'Recipient name', fr: 'Nom du destinataire' } }] }] })
    if (path.endsWith('/templates')) return json({ templates: [template] })
    return json({ configured: true })
  })
  vi.stubGlobal('fetch', fetcher)
})
afterEach(() => { vi.unstubAllGlobals(); clearExtensionUiRuntime() })
const render = (model: GcsExtensionJsonConfig = {}) => mount(AgencyConfig, { props: { agencyId: '17', extension: { ...config, rootDir: '/test' } as never, persistedConfig: {}, modelValue: model } })
describe('Agency configuration through the SDK runtime', () => {
  it('loads credentials, chooses template, maps host fields and preserves mapped draft', async () => {
    const wrapper = render()
    await flushPromises()
    expect(wrapper.text()).toContain('An API key is configured.')
    const button = wrapper.findAll('button').find(item => item.text() === 'Load email templates')
    await button?.trigger('click'); await flushPromises()
    const selects = wrapper.findAll('select')
    await selects[0]?.setValue(templateId)
    const selected = wrapper.emitted('update:modelValue')?.at(-1)?.[0]
    await wrapper.setProps({ modelValue: selected as GcsExtensionJsonConfig })
    await wrapper.findAll('select')[1]?.setValue('recipient_name')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({ mappings: { 'approval.action_required': { templateId, personalisation: { recipient: 'recipient_name' } } } })
    const mappingField = wrapper.findAllComponents(ExtensionFormField).find(field => field.attributes('data-ui-target')?.endsWith('.mapping'))
    expect(mappingField?.attributes('required')).toBeDefined()
    expect(wrapper.findAllComponents(ExtensionSelectMenu)[1]?.vm.$attrs['aria-required']).toBe('true')
    expect(wrapper.findComponent(ExtensionInput).vm.$attrs.required).toBe(false)
    expect(wrapper.findComponent(ExtensionSaveButton).attributes('type')).toBe('button')
    wrapper.unmount()
  })
  it('saves key only when supplied, clears sensitive draft and retranslates retained feedback', async () => {
    const wrapper = render(); await flushPromises()
    await wrapper.find('input').setValue('synthetic-key')
    await wrapper.findAll('button')[0]?.trigger('click'); await flushPromises()
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/credentials'), expect.objectContaining({ method: 'PUT', body: JSON.stringify({ apiKey: 'synthetic-key' }) }))
    expect(wrapper.find('input').element.value).toBe('')
    expect(wrapper.text()).toContain('API key saved.')
    locale.value = 'fr-CA'; await flushPromises()
    expect(wrapper.text()).toContain('Clé API enregistrée.')
    expect(wrapper.text()).toContain('Charger les modèles de courriel')
    wrapper.unmount()
  })
  it('locks the sensitive draft during a pending credential save', async () => {
    const wrapper = render(); await flushPromises()
    let complete: (value: Response) => void = () => undefined
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve }))
    await wrapper.find('input').setValue('synthetic-key')
    await wrapper.findAll('button')[0]?.trigger('click'); await flushPromises()
    expect(wrapper.findComponent(ExtensionInput).vm.$attrs.disabled).toBe(true)
    expect(wrapper.findComponent(ExtensionSaveButton).vm.$attrs.loading).toBe(true)
    complete(json({ configured: true })); await flushPromises()
    expect(wrapper.findComponent(ExtensionInput).vm.$attrs.disabled).toBe(false)
    expect(wrapper.find('input').element.value).toBe('')
    wrapper.unmount()
  })
  it('retains failed-key retry feedback and localizes it after locale change', async () => {
    const wrapper = render(); await flushPromises()
    fetcher.mockResolvedValueOnce(json({}, 403))
    await wrapper.find('input').setValue('bad-key')
    await wrapper.findAll('button')[0]?.trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('Unable to complete the request')
    expect(wrapper.find('input').element.value).toBe('bad-key')
    locale.value = 'fr'; await flushPromises()
    expect(wrapper.text()).toContain('Impossible de terminer la demande')
    wrapper.unmount()
  })
  it('rejects old in-flight Agency and authority results', async () => {
    let resolve: (value: Response) => void = () => undefined
    fetcher.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done }))
    const wrapper = render()
    await wrapper.setProps({ agencyId: '18' }); await flushPromises()
    expect(wrapper.text()).toContain('An API key is configured.')
    await wrapper.setProps({ readOnly: true }); await flushPromises()
    resolve(json({ configured: true })); await flushPromises()
    expect(wrapper.text()).toContain('No API key is configured.')
    expect(wrapper.findAll('button').every(button => button.element.disabled)).toBe(true)
    wrapper.unmount()
  })
  it('shows a failed-template retry without discarding the saved mapping', async () => {
    const model = { mappings: { 'approval.action_required': { templateId, personalisation: { recipient: 'recipient_name' } } } }
    const wrapper = render(model); await flushPromises()
    fetcher.mockResolvedValueOnce(json({}, 503))
    await wrapper.findAll('button')[1]?.trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('Unable to complete the request')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.findAll('button')[1]?.trigger('click'); await flushPromises()
    expect(wrapper.find('select').text()).toContain('Bilingual')
    const selects = wrapper.findAllComponents(ExtensionSelectMenu)
    selects[1]?.vm.$emit('update:modelValue', undefined); await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({ mappings: { 'approval.action_required': { templateId, personalisation: {} } } })
    selects[0]?.vm.$emit('update:modelValue', undefined); await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({ mappings: {} })
    wrapper.unmount()
  })
  it('rejects stale credential-save success after changing Agency', async () => {
    const wrapper = render(); await flushPromises()
    let complete: (value: Response) => void = () => undefined
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve }))
    await wrapper.find('input').setValue('synthetic-key')
    await wrapper.findAll('button')[0]?.trigger('click'); await flushPromises()
    await wrapper.setProps({ agencyId: '18' }); await flushPromises()
    complete(json({ configured: true })); await flushPromises()
    expect(wrapper.text()).not.toContain('API key saved.')
    expect(wrapper.find('input').element.value).toBe('')
    wrapper.unmount()
  })
  it('does not request disabled unsaved configuration and preserves saved mapping label', async () => {
    const wrapper = render({ mappings: { 'approval.action_required': { templateId, personalisation: { recipient: 'recipient_name' } } } })
    await wrapper.setProps({ persistedConfig: undefined, enabled: false }); await flushPromises()
    expect(wrapper.text()).toContain('Enable and save')
    expect(wrapper.find('select').text()).toContain(templateId)
    expect(wrapper.findAll('button').every(button => button.element.disabled)).toBe(true)
    wrapper.unmount()
  })
})
