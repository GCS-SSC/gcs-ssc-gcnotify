import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { GcsExtensionRouteContext, GcsExtensionConfigurationGuardContext } from '@gcs-ssc/extensions/server'
const sdk = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), lock: vi.fn(), register: vi.fn(), stream: vi.fn() }))
vi.mock('@gcs-ssc/extensions/server', async original => ({ ...await original<typeof import('@gcs-ssc/extensions/server')>(), getEncryptedExtensionSecret: sdk.get, setEncryptedExtensionSecret: sdk.set, lockGcsExtensionLifecycleScope: sdk.lock, registerGcsExtensionConfigurationGuard: sdk.register, resolveExtensionStreamContext: sdk.stream }))
import { credentialSummary, loadCredential, saveCredential, listTemplates } from '../../server/credentials'
import guardPlugin, { validateConfiguration } from '../../server/plugins/configuration-guard'
import getRoute from '../../server/api/credentials.get'
import putRoute from '../../server/api/credentials.put'
import templateRoute from '../../server/api/templates.get'
import { EXTENSION_KEY } from '../../shared/config'

// Deliberately synthetic UUIDs, not credentials issued by GC Notify.
const syntheticServiceId = '11111111-1111-4111-8111-111111111111'
const syntheticKeyId = '22222222-2222-4222-8222-222222222222'
const apiKey = ['gcntfy', 'test', syntheticServiceId, syntheticKeyId].join('-')
const templateId = '33333333-3333-4333-8333-333333333333'
const template = { id: templateId, name: 'Approvals', type: 'email', personalisation: { name: { required: true } } }
const query = { select: vi.fn(), where: vi.fn(), forUpdate: vi.fn(), executeTakeFirst: vi.fn() }
for (const operation of [query.select, query.where, query.forUpdate]) operation.mockReturnValue(query)
const trx = { selectFrom: vi.fn(() => query) }
const auth = { lockAuthState: vi.fn(), authorizeCurrentEntity: vi.fn(), authorizeCurrentScope: vi.fn() }
const context = (body: unknown = { apiKey }): GcsExtensionRouteContext => ({ params: { agencyId: '17' }, db: { transaction: () => ({ execute: async (callback: (value: unknown) => Promise<unknown>) => await callback(trx) }) }, readBody: async () => body, writeAuthorization: auth }) as unknown as GcsExtensionRouteContext
const streamScope = { type: 'entity' as const, agencyId: '17', path: [{ type: 'transfer_payment', id: '10' }, { type: 'transfer_payment_stream', id: '118' }] }
const streamRequest = (): GcsExtensionRouteContext => { const request = context(); request.params = { streamId: '118', agencyId: '999' }; request.stream = { streamId: '118', agencyId: '17' }; request.authorizedScope = streamScope; return request }
const emailField = { id: 'recipient_email', name: { en: 'Recipient email', fr: 'Courriel du destinataire' }, type: 'email' as const, group: { id: 'approval', name: { en: 'Approval', fr: 'Approbation' } } }
const guardContext = (config: unknown = { mappings: [{ templateId, recipientEmail: 'recipient_email', notifierId: 'approval.action_required', personalisation: { name: 'recipient_name' } }] }): GcsExtensionConfigurationGuardContext => ({ extensionKey: EXTENSION_KEY, targetExtensionKey: EXTENSION_KEY, scope: 'stream', agencyId: '17', streamId: '118', enabled: true, config, db: {}, event: {}, notificationNotifiers: [{ id: 'approval.action_required', name: { en: 'Approval', fr: 'Approbation' }, fields: [emailField, { id: 'recipient_name', name: { en: 'Name', fr: 'Nom' }, type: 'text', group: { id: 'approval', name: { en: 'Approval', fr: 'Approbation' } } }] }] }) as unknown as GcsExtensionConfigurationGuardContext
beforeEach(() => {
  vi.clearAllMocks()
  sdk.stream.mockResolvedValue({ agencyId: '17', streamId: '118', scope: streamScope }); sdk.get.mockResolvedValue({ apiKey }); sdk.set.mockResolvedValue({ id: '1' }); query.executeTakeFirst.mockResolvedValue({ enabled: true })
  vi.stubEnv('GCS_EXTENSION_SECRETS_KEY', Buffer.alloc(32, 1).toString('base64'))
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => new Response(JSON.stringify(url.includes('/v2/template/') ? template : { templates: [template] }))))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('Manager configuration credentials', () => {
  it('returns only configured state and loads secrets through SDK', async () => {
    expect(await credentialSummary(context())).toEqual({ configured: true })
    expect(await loadCredential(context().db, '17')).toEqual({ apiKey })
    sdk.get.mockResolvedValue(null)
    expect(await credentialSummary(context())).toEqual({ configured: false })
    await expect(loadCredential(context().db, '17')).rejects.toMatchObject({ statusCode: 409 })
    sdk.get.mockResolvedValue({ apiKey: 'broken' })
    await expect(loadCredential(context().db, '17')).rejects.toThrow()
    expect(await credentialSummary(context())).toEqual({ configured: false })
  })
  it('rechecks authorization under lock and tests candidate before encrypted replacement', async () => {
    expect(await saveCredential(context())).toEqual({ configured: true })
    expect(auth.lockAuthState).toHaveBeenCalledWith(trx)
    expect(sdk.lock).toHaveBeenCalledWith(trx, EXTENSION_KEY, '17')
    expect(auth.authorizeCurrentScope).toHaveBeenCalledWith(trx)
    expect(query.forUpdate).toHaveBeenCalledOnce()
    expect(sdk.set).toHaveBeenCalledWith(trx, expect.objectContaining({ extensionKey: EXTENSION_KEY, ownerId: '17', secretKey: 'api-key', value: { apiKey }, metadata: { configured: true } }))
    expect(JSON.stringify(await saveCredential(context()))).not.toContain(apiKey)
    const fallback = context(); delete fallback.writeAuthorization?.authorizeCurrentScope
    await saveCredential(fallback)
    expect(auth.authorizeCurrentEntity).toHaveBeenCalled()
  })
  it('blocks candidate changes on disabled, invalid or unauthorized requests', async () => {
    await expect(saveCredential(context({ apiKey: 'invalid' }))).rejects.toMatchObject({ statusCode: 400 })
    const missingAuth = context(); delete missingAuth.writeAuthorization
    await expect(saveCredential(missingAuth)).rejects.toThrow('transaction authorization')
    const missingAgency = context(); delete missingAgency.params.agencyId
    await expect(saveCredential(missingAgency)).rejects.toThrow()
    query.executeTakeFirst.mockResolvedValueOnce({ enabled: false })
    await expect(saveCredential(context())).rejects.toMatchObject({ statusCode: 409 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })))
    await expect(saveCredential(context())).rejects.toMatchObject({ statusCode: 503 })
    expect(sdk.set).not.toHaveBeenCalled()
  })
  it('does not expose candidates when encryption configuration is absent', async () => {
    vi.stubEnv('GCS_EXTENSION_SECRETS_KEY', '')
    await expect(credentialSummary(context())).rejects.toThrow('GCS_EXTENSION_SECRETS_KEY')
  })
  it('returns current remote templates for editor discovery', async () => {
    const request = streamRequest()
    expect(await listTemplates(request)).toEqual({ templates: [{ id: templateId, name: 'Approvals', kind: 'email', requiredPersonalisation: ['name'] }] })
    expect(typeof getRoute).toBe('function')
    expect(typeof putRoute).toBe('function')
    expect(typeof templateRoute).toBe('function')
  })
})
describe('configuration save guard', () => {
  it('requires every latest remote placeholder and supported host field', async () => {
    await expect(validateConfiguration(guardContext())).resolves.toBeUndefined()
    await expect(validateConfiguration(guardContext({ mappings: [{ templateId, recipientEmail: 'recipient_email', notifierId: 'approval.action_required', personalisation: {} }] }))).rejects.toMatchObject({ code: 'GCS_GCNOTIFY_REQUIREDMAPPING' })
    await expect(validateConfiguration(guardContext({ mappings: false }))).rejects.toMatchObject({ code: 'GCS_GCNOTIFY_INVALID' })
  })
  it('validates dynamic host catalog IDs and reports the exact mapping field', async () => {
    const request = guardContext()
    await expect(validateConfiguration({ ...request, notificationNotifiers: [] })).rejects.toMatchObject({ details: [{ path: 'mappings.0.notifierId' }] })
    await expect(validateConfiguration(guardContext({ mappings: [{ templateId, recipientEmail: 'recipient_email', notifierId: 'approval.action_required', personalisation: { name: 'unknown' } }] }))).rejects.toMatchObject({ details: [{ path: 'mappings.0.personalisation.name' }] })
    expect(fetch).not.toHaveBeenCalled()
    const custom = { id: 'other.host.notifier', name: { en: 'Other', fr: 'Autre' }, fields: [emailField, { id: 'custom_host_value', name: { en: 'Custom', fr: 'Personnalisé' }, type: 'text' as const, group: { id: 'custom', name: { en: 'Custom', fr: 'Personnalisé' } } }] }
    await expect(validateConfiguration({ ...guardContext({ mappings: [{ templateId, recipientEmail: 'recipient_email', notifierId: custom.id, personalisation: { name: 'custom_host_value' } }] }), notificationNotifiers: [custom] })).resolves.toBeUndefined()
    await expect(validateConfiguration({ ...guardContext(), scope: 'agency', streamId: undefined })).rejects.toMatchObject({ code: 'GCS_GCNOTIFY_INVALID' })
  })
  it('requires valid explicit time zones only for date and time host fields', async () => {
    const notifier = { id: 'approval.action_required', name: { en: 'Approval', fr: 'Approbation' }, fields: [emailField, { id: 'date_value', name: { en: 'Date', fr: 'Date' }, type: 'date' as const, group: { id: 'system', name: { en: 'System', fr: 'Système' } } }] }
    const request = (value: unknown) => ({ ...guardContext({ mappings: [{ templateId, recipientEmail: 'recipient_email', notifierId: notifier.id, personalisation: { name: value } }] }), notificationNotifiers: [notifier] })
    await expect(validateConfiguration(request('date_value'))).rejects.toMatchObject({ details: [{ path: 'mappings.0.personalisation.name.timeZone' }] })
    await expect(validateConfiguration(request({ fieldId: 'date_value', timeZone: 'Invalid/Zone' }))).rejects.toMatchObject({ details: [{ path: 'mappings.0.personalisation.name.timeZone' }] })
    await expect(validateConfiguration(request({ fieldId: 'date_value', timeZone: '+01:00' }))).rejects.toMatchObject({ details: [{ path: 'mappings.0.personalisation.name.timeZone' }] })
    await expect(validateConfiguration(request({ fieldId: 'date_value', timeZone: 'UTC' }))).rejects.toMatchObject({ details: [{ path: 'mappings.0.personalisation.name.locale' }] })
    for (const locale of ['de', null, 17]) await expect(validateConfiguration(request({ fieldId: 'date_value', timeZone: 'UTC', locale }))).rejects.toMatchObject({ details: [{ path: 'mappings.0.personalisation.name.locale' }] })
    expect(fetch).not.toHaveBeenCalled()
    await expect(validateConfiguration(request({ fieldId: 'date_value', timeZone: 'America/Toronto', locale: 'en' }))).resolves.toBeUndefined()
    await expect(validateConfiguration(guardContext({ mappings: [{ templateId, recipientEmail: 'recipient_email', notifierId: notifier.id, personalisation: { name: { fieldId: 'recipient_name', timeZone: 'UTC' } } }] }))).rejects.toMatchObject({ details: [{ path: 'mappings.0.personalisation.name' }] })
  })
  it('requires an explicit language for localized text and preserves locale-free read mappings', async () => {
    const notifier = { id: 'approval.action_required', name: { en: 'Approval', fr: 'Approbation' }, fields: [emailField, { id: 'localized_value', name: { en: 'Name', fr: 'Nom' }, type: 'localized-text' as const, group: { id: 'system', name: { en: 'System', fr: 'Système' } } }] }
    const request = (value: unknown) => ({ ...guardContext({ mappings: [{ templateId, recipientEmail: 'recipient_email', notifierId: notifier.id, personalisation: { name: value } }] }), notificationNotifiers: [notifier] })
    await expect(validateConfiguration(request('localized_value'))).rejects.toMatchObject({ details: [{ path: 'mappings.0.personalisation.name.locale' }] })
    await expect(validateConfiguration(request({ fieldId: 'localized_value', locale: 'xx' }))).rejects.toMatchObject({ details: [{ path: 'mappings.0.personalisation.name.locale' }] })
    expect(fetch).not.toHaveBeenCalled()
    await expect(validateConfiguration(request({ fieldId: 'localized_value', locale: 'fr' }))).resolves.toBeUndefined()
    await expect(validateConfiguration(request({ fieldId: 'localized_value', locale: 'fr', timeZone: 'UTC' }))).rejects.toMatchObject({ details: [{ path: 'mappings.0.personalisation.name' }] })
  })
  it('requires a mapped email-typed recipient before accessing credentials or the provider', async () => {
    const mapping = { templateId, notifierId: 'approval.action_required', personalisation: { name: 'recipient_name' } }
    await expect(validateConfiguration(guardContext({ mappings: [mapping] }))).rejects.toMatchObject({ details: [{ path: 'mappings.0.recipientEmail' }] })
    await expect(validateConfiguration(guardContext({ mappings: [{ ...mapping, recipientEmail: 'recipient_name' }] }))).rejects.toMatchObject({ details: [{ path: 'mappings.0.recipientEmail' }] })
    expect(fetch).not.toHaveBeenCalled(); expect(sdk.get).not.toHaveBeenCalled()
    await expect(validateConfiguration(guardContext({ mappings: [{ ...mapping, recipientEmail: 'recipient_email', personalisation: { name: 'recipient_email' } }] }))).resolves.toBeUndefined()
  })
  it('resolves a Stream Agency server-side and does not trust a supplied Agency identifier', async () => {
    const request = streamRequest()
    expect(await listTemplates(request)).toHaveProperty('templates')
    expect(sdk.get).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ownerId: '17' }))
    sdk.stream.mockResolvedValueOnce(null)
    await expect(listTemplates(request)).rejects.toMatchObject({ statusCode: 404 })
    await expect(listTemplates(context())).rejects.toMatchObject({ statusCode: 400 })
  })
  it('rejects an ownership transfer after host authorization before any secret or external request', async () => {
    const request = streamRequest()
    sdk.stream.mockResolvedValueOnce({ agencyId: '18', streamId: '118', scope: { ...streamScope, agencyId: '18' } })
    await expect(listTemplates(request)).rejects.toMatchObject({ code: 'GCS_GCNOTIFY_SCOPECHANGED', statusCode: 403 })
    expect(sdk.get).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
    sdk.stream.mockResolvedValueOnce({ agencyId: '17', streamId: '118', scope: { ...streamScope, path: [{ type: 'transfer_payment', id: '20' }, { type: 'transfer_payment_stream', id: '118' }] } })
    await expect(listTemplates(request)).rejects.toMatchObject({ statusCode: 403 })
    const missingCapturedScope = streamRequest(); delete missingCapturedScope.authorizedScope
    await expect(listTemplates(missingCapturedScope)).rejects.toMatchObject({ statusCode: 403 })
    expect(sdk.get).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  })
  it('permits empty bootstrap and skips other extension/disabled/scope changes', async () => {
    for (const context of [guardContext({}), { ...guardContext(), extensionKey: 'other' }, { ...guardContext(), targetExtensionKey: 'other' }, { ...guardContext(), scope: 'agency' as const, config: {} }, { ...guardContext(), enabled: false }, { ...guardContext(), config: undefined }]) await validateConfiguration(context)
    expect(fetch).not.toHaveBeenCalled()
    const app = { hooks: { hook: vi.fn() } }
    await guardPlugin(app as never)
    expect(sdk.register).toHaveBeenCalledWith(EXTENSION_KEY, validateConfiguration, app)
  })
})
