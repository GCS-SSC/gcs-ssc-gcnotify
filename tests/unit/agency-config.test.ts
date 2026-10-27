// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createExtensionTestUiRuntime } from '@gcs-ssc/extensions/testing'
import { clearExtensionUiRuntime, setExtensionUiRuntime, ExtensionInput, ExtensionSaveButton } from '@gcs-ssc/extensions/ui'
import config from '../../extension.config'
import AgencyConfig from '../../components/AgencyGcNotifyConfig.vue'
const locale = ref('en')
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
let fetcher: ReturnType<typeof vi.fn>
beforeEach(() => {
  locale.value = 'en'
  const runtime = createExtensionTestUiRuntime(); runtime.composables.useI18n = () => ({ locale, n: String }); setExtensionUiRuntime(runtime)
  fetcher = vi.fn().mockImplementation(async () => json({ configured: true })); vi.stubGlobal('fetch', fetcher)
})
afterEach(() => { vi.unstubAllGlobals(); clearExtensionUiRuntime() })
const render = () => mount(AgencyConfig, { props: { agencyId: '17', extension: { ...config, rootDir: '/test' } as never, persistedConfig: {}, modelValue: {} } })
describe('Agency key-only configuration', () => {
  it('only loads key state and renders no template, notifier, or mapping controls', async () => {
    const wrapper = render(); await flushPromises()
    expect(wrapper.text()).toContain('An API key is configured.')
    expect(wrapper.findAll('input')).toHaveLength(1); expect(wrapper.findAll('button')).toHaveLength(1); expect(wrapper.findAll('select')).toHaveLength(0)
    expect(fetcher).toHaveBeenCalledOnce(); expect(fetcher.mock.calls[0]?.[0]).toContain('/agencies/17/credentials')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
  it('saves and clears only the secret draft and retranslates retained feedback', async () => {
    const wrapper = render(); await flushPromises(); await wrapper.find('input').setValue('synthetic-key'); await wrapper.find('button').trigger('click'); await flushPromises()
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/credentials'), expect.objectContaining({ method: 'PUT', body: JSON.stringify({ apiKey: 'synthetic-key' }) }))
    expect(wrapper.find('input').element.value).toBe(''); expect(wrapper.text()).toContain('API key saved.')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    locale.value = 'fr-CA'; await flushPromises(); expect(wrapper.text()).toContain('Clé API enregistrée.')
    wrapper.unmount()
  })
  it('retains failed candidates for retry and locks editing during a pending save', async () => {
    const wrapper = render(); await flushPromises()
    let complete: (value: Response) => void = () => undefined
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve }))
    await wrapper.find('input').setValue('synthetic-key'); await wrapper.find('button').trigger('click'); await flushPromises()
    expect(wrapper.findComponent(ExtensionInput).vm.$attrs.disabled).toBe(true); expect(wrapper.findComponent(ExtensionSaveButton).vm.$attrs.loading).toBe(true)
    complete(json({}, 403)); await flushPromises()
    expect(wrapper.find('input').element.value).toBe('synthetic-key'); expect(wrapper.text()).toContain('Unable to complete')
    locale.value = 'fr'; await flushPromises(); expect(wrapper.text()).toContain('Impossible de terminer')
    wrapper.unmount()
  })
  it('rejects old Agency/authority responses and ignores results after unmount', async () => {
    let complete: (value: Response) => void = () => undefined
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve }))
    const wrapper = render(); await wrapper.setProps({ agencyId: '18' }); await flushPromises(); await wrapper.setProps({ readOnly: true }); await flushPromises()
    complete(json({ configured: true })); await flushPromises()
    expect(wrapper.text()).toContain('No API key is configured.'); expect(wrapper.find('button').element.disabled).toBe(true)
    wrapper.unmount()
  })
  it('disables unsaved or disabled Agency configuration without demanding a replacement key', async () => {
    const wrapper = render(); await wrapper.setProps({ persistedConfig: undefined, enabled: false }); await flushPromises()
    expect(wrapper.text()).toContain('Enable and save'); expect(wrapper.find('button').element.disabled).toBe(true)
    expect(wrapper.findComponent(ExtensionInput).vm.$attrs.required).toBe(false)
    wrapper.unmount()
  })
})
