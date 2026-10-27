import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { GcsExtensionRouteContext, GcsExtensionConfigurationGuardContext } from '@gcs-ssc/extensions/server'
const sdk = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), lock: vi.fn(), register: vi.fn() }))
vi.mock('@gcs-ssc/extensions/server', async original => ({ ...await original<typeof import('@gcs-ssc/extensions/server')>(), getEncryptedExtensionSecret: sdk.get, setEncryptedExtensionSecret: sdk.set, lockGcsExtensionLifecycleScope: sdk.lock, registerGcsExtensionConfigurationGuard: sdk.register }))
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
const guardContext = (config: unknown = { mappings: { 'approval.action_required': { templateId, personalisation: { name: 'recipient_name' } } } }): GcsExtensionConfigurationGuardContext => ({ extensionKey: EXTENSION_KEY, targetExtensionKey: EXTENSION_KEY, scope: 'agency', agencyId: '17', enabled: true, config, db: {}, event: {} }) as unknown as GcsExtensionConfigurationGuardContext
beforeEach(() => {
  vi.clearAllMocks()
  sdk.get.mockResolvedValue({ apiKey }); sdk.set.mockResolvedValue({ id: '1' }); query.executeTakeFirst.mockResolvedValue({ enabled: true })
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
    expect(await listTemplates(context())).toEqual({ templates: [{ id: templateId, name: 'Approvals', kind: 'email', requiredPersonalisation: ['name'] }] })
    expect(typeof getRoute).toBe('function')
    expect(typeof putRoute).toBe('function')
    expect(typeof templateRoute).toBe('function')
  })
})
describe('configuration save guard', () => {
  it('requires every latest remote placeholder and supported host field', async () => {
    await expect(validateConfiguration(guardContext())).resolves.toBeUndefined()
    await expect(validateConfiguration(guardContext({ mappings: { 'approval.action_required': { templateId, personalisation: {} } } }))).rejects.toMatchObject({ code: 'GCS_GCNOTIFY_REQUIREDMAPPING' })
    await expect(validateConfiguration(guardContext({ mappings: false }))).rejects.toMatchObject({ code: 'GCS_GCNOTIFY_INVALID' })
  })
  it('permits empty bootstrap and skips other extension/disabled/scope changes', async () => {
    for (const context of [guardContext({}), { ...guardContext(), extensionKey: 'other' }, { ...guardContext(), targetExtensionKey: 'other' }, { ...guardContext(), scope: 'stream' as const }, { ...guardContext(), enabled: false }, { ...guardContext(), config: undefined }]) await validateConfiguration(context)
    expect(fetch).not.toHaveBeenCalled()
    const app = { hooks: { hook: vi.fn() } }
    await guardPlugin(app as never)
    expect(sdk.register).toHaveBeenCalledWith(EXTENSION_KEY, validateConfiguration, app)
  })
})
