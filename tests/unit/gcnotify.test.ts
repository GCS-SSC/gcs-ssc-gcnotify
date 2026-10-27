import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGcNotifyClient, deliveryIdentity, matchesDeliveryIdentity, GC_NOTIFY_ORIGIN } from '../../server/gcnotify'
import adapter from '../../server/notification-adapter'
import { AgencyConfigSchema, parseAgencyConfig, CREDENTIAL_SECRET_KEY, CredentialSchema } from '../../shared/config'
import manifest from '../../extension.config'
import { messages, localized } from '../../i18n/messages'

const serviceId = '11111111-1111-4111-8111-111111111111'
const templateId = '33333333-3333-4333-8333-333333333333'
const notificationId = '44444444-4444-4444-8444-444444444444'
const syntheticKeyId = '22222222-2222-4222-8222-222222222222'
const apiKey = ['gcntfy', 'my-test-key', serviceId, syntheticKeyId].join('-')
const template = { id: templateId, name: 'Bilingual approval', type: 'email', personalisation: { name: { required: true }, optional: { required: false } } }
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
const context = () => ({ agencyId: '1', agencyConfig: {}, secrets: { get: async (key: string) => key === CREDENTIAL_SECRET_KEY ? { apiKey } : null }, signal: new AbortController().signal })
const sendInput = () => ({ ...context(), deliveryContext: deliveryIdentity(apiKey), templateId, recipientEmail: 'test@example.ca', personalisation: { name: 'Jane' }, reference: 'opaque-reference' })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('GC Notify transport', () => {
  it('uses official origin, raw-key auth, bounded signal and redirect rejection', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ templates: [template] }))
    vi.stubGlobal('fetch', fetcher)
    const signal = new AbortController().signal
    expect(await createGcNotifyClient(apiKey, signal).listTemplates()).toEqual([{ id: templateId, name: template.name, kind: 'email', requiredPersonalisation: ['name'] }])
    expect(fetcher).toHaveBeenCalledWith(`${GC_NOTIFY_ORIGIN}/v2/templates?type=email`, expect.objectContaining({ method: 'GET', headers: { Authorization: `ApiKey-v1 ${apiKey}`, 'Content-Type': 'application/json' }, signal, redirect: 'error' }))
  })
  it('reads current template metadata and sends stable personalisation/reference', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(template)).mockResolvedValueOnce(response({ id: notificationId }))
    vi.stubGlobal('fetch', fetcher)
    expect(await adapter.send(sendInput())).toEqual({ kind: 'accepted', notificationId })
    expect(fetcher.mock.calls[1]?.[0]).toBe(`${GC_NOTIFY_ORIGIN}/v2/notifications/email`)
    expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toEqual({ email_address: 'test@example.ca', template_id: templateId, personalisation: { name: 'Jane' }, reference: 'opaque-reference' })
  })
  it.each([[400, false], [401, false], [403, false], [404, false], [429, true], [500, true], [503, true]])('classifies explicit HTTP %i as unprocessed', async (status, retryable) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, status)))
    expect(await createGcNotifyClient(apiKey, context().signal).send(sendInput())).toEqual({ kind: 'rejected', retryable })
  })
  it('leaves transport failures and malformed success ambiguous', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection lost')))
    await expect(createGcNotifyClient(apiKey, context().signal).send(sendInput())).rejects.toThrow('connection lost')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({})))
    await expect(createGcNotifyClient(apiKey, context().signal).send(sendInput())).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 302 })))
    await expect(createGcNotifyClient(apiKey, context().signal).send(sendInput())).rejects.toThrow()
  })
  it('rejects non-email and malformed remote template responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...template, type: 'sms' })))
    await expect(createGcNotifyClient(apiKey, context().signal).getTemplate(templateId)).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 403)))
    await expect(createGcNotifyClient(apiKey, context().signal).listTemplates()).rejects.toMatchObject({ statusCode: 503 })
    await expect(createGcNotifyClient(apiKey, context().signal).getTemplate('../secret')).rejects.toThrow()
  })
  it('reconciles a matching reference without querying delivered state', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ notifications: [{ id: notificationId, reference: 'opaque-reference' }] }))
    vi.stubGlobal('fetch', fetcher)
    expect(await adapter.recover({ ...context(), deliveryContext: deliveryIdentity(apiKey), attemptedAt: new Date().toISOString(), reference: 'opaque-reference' })).toEqual({ kind: 'found', notificationId })
    expect(fetcher.mock.calls[0]?.[0]).toBe(`${GC_NOTIFY_ORIGIN}/v2/notifications?reference=opaque-reference&template_type=email`)
  })
  it('never treats an empty, mismatched or expired lookup as absence', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ notifications: [{ id: notificationId, reference: 'another' }] }))
    vi.stubGlobal('fetch', fetcher)
    const input = { ...context(), deliveryContext: deliveryIdentity(apiKey), attemptedAt: new Date().toISOString(), reference: 'ref & value' }
    expect(await adapter.recover(input)).toEqual({ kind: 'inconclusive' })
    expect(fetcher.mock.calls[0]?.[0]).toContain('reference=ref%20%26%20value')
    fetcher.mockResolvedValue(response({ notifications: [] }))
    expect(await adapter.recover(input)).toEqual({ kind: 'inconclusive' })
    fetcher.mockClear()
    for (const attemptedAt of ['invalid', '2000-01-01T00:00:00Z', '2999-01-01T00:00:00Z']) expect(await adapter.recover({ ...input, attemptedAt })).toEqual({ kind: 'inconclusive' })
    expect(await adapter.recover({ ...input, deliveryContext: {} })).toEqual({ kind: 'inconclusive' })
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('provider/configuration boundary', () => {
  it('allows same-service rotated-key recovery only when a reference is found', async () => {
    const rotated = apiKey.replace('my-test-key', 'rotated-key')
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => response({ notifications: [{ id: notificationId, reference: 'opaque-reference' }] })))
    const input = { ...context(), secrets: { get: async () => ({ apiKey: rotated }) }, deliveryContext: deliveryIdentity(apiKey), attemptedAt: new Date().toISOString(), reference: 'opaque-reference' }
    expect(await adapter.recover(input)).toEqual({ kind: 'found', notificationId })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ notifications: [] })))
    expect(await adapter.recover(input)).toEqual({ kind: 'inconclusive' })
    expect(await adapter.recover({ ...input, deliveryContext: { ...deliveryIdentity(apiKey), serviceId: templateId } })).toEqual({ kind: 'inconclusive' })
  })

  it('captures a nonsecret exact-key identity and refuses rotation', async () => {
    const identity = await adapter.prepareDelivery(context())
    expect(identity).toEqual(deliveryIdentity(apiKey))
    expect(JSON.stringify(identity)).not.toContain('22222222-2222')
    expect(matchesDeliveryIdentity(identity, apiKey)).toBe(true)
    expect(matchesDeliveryIdentity(identity, apiKey.replace('my-test-key', 'another'))).toBe(false)
    expect(matchesDeliveryIdentity(identity, apiKey.replace('my-test-key', 'another'), 'service')).toBe(true)
    expect(matchesDeliveryIdentity({}, apiKey)).toBe(false)
    expect(await adapter.send({ ...sendInput(), deliveryContext: {} })).toEqual({ kind: 'rejected', retryable: false })
  })
  it('validates catalog mappings and resolves only the declared notifier', () => {
    const config = { mappings: { 'approval.action_required': { templateId, personalisation: { name: 'recipient_name' } } } }
    expect(adapter.validateAgencyConfig(config)).toEqual(config)
    expect(adapter.resolveMapping({ agencyConfig: config, notifierId: 'approval.action_required' })).toEqual(config.mappings['approval.action_required'])
    expect(adapter.resolveMapping({ agencyConfig: {}, notifierId: 'approval.action_required' })).toBeNull()
    expect(adapter.resolveMapping({ agencyConfig: config, notifierId: 'other' })).toBeNull()
    expect(() => adapter.resolveMapping({ agencyConfig: { mappings: false }, notifierId: 'approval.action_required' })).toThrow()
    expect(() => adapter.validateAgencyConfig({ mappings: { 'approval.action_required': { templateId, personalisation: { name: 'secret' } } } })).toThrow()
    expect(AgencyConfigSchema.parse({})).toEqual({ mappings: {} })
    expect(parseAgencyConfig({})).toEqual({ mappings: {} })
    expect(CredentialSchema.safeParse({ apiKey: 'x' }).success).toBe(false)
  })
  it('rejects unavailable credentials and missing required mapped fields', async () => {
    await expect(adapter.prepareDelivery({ ...context(), secrets: { get: async () => null } })).rejects.toMatchObject({ statusCode: 409 })
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => response(template)))
    expect(await adapter.send({ ...sendInput(), personalisation: {} })).toEqual({ kind: 'rejected', retryable: false })
    expect(await adapter.listTemplates({ ...context() }).catch(() => [])).toEqual([])
    expect(await adapter.getTemplate({ ...context(), templateId })).toMatchObject({ id: templateId })
  })
  it('declares Manager-only public extension boundaries and bilingual catalogs', () => {
    expect(manifest.configurationAccess).toBe('manager')
    expect(manifest.configurationScope).toBe('agency')
    expect(manifest.serverHandlers?.every(handler => handler.rbac?.action === 'delete')).toBe(true)
    expect(manifest.notificationProvider?.adapter.path).toContain('notification-adapter')
    expect(manifest.auditOwnership).toEqual([])
    for (const key of Object.keys(messages.en)) expect(Object.hasOwn(messages.fr, key)).toBe(true)
    expect(localized('invalid')).toEqual({ en: messages.en.invalid, fr: messages.fr.invalid })
  })
})
