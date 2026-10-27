import { getEncryptedExtensionSecret, setEncryptedExtensionSecret, lockGcsExtensionLifecycleScope, resolveExtensionStreamContext, type GcsExtensionRouteContext } from '@gcs-ssc/extensions/server'
import type { Kysely } from 'kysely'
import { z } from 'zod'
import { EXTENSION_KEY, CREDENTIAL_SECRET_KEY, CredentialSchema } from '../shared/config.ts'
import { createGcNotifyClient } from './gcnotify.ts'
import { userError } from './errors.ts'

interface ConfigurationDatabase {
  'extensions.agency_enablement': { agency_id: string; extension_key: string; enabled: boolean; _deleted: boolean }
}
const rootKey = (): string => {
  const value = process.env.GCS_EXTENSION_SECRETS_KEY
  if (!value) throw new Error('GCS_EXTENSION_SECRETS_KEY is required')
  return value
}
export const loadCredential = async (db: GcsExtensionRouteContext['db'], agencyId: string) => {
  const secret = await getEncryptedExtensionSecret(db as never, { rootKey: rootKey(), extensionKey: EXTENSION_KEY, ownerType: 'agency', ownerId: agencyId, secretKey: CREDENTIAL_SECRET_KEY })
  if (secret === null) throw userError('credentialsInvalid', 409)
  const parsed = CredentialSchema.safeParse(secret)
  if (!parsed.success) throw userError('credentialsInvalid', 409)
  return parsed.data
}
const owner = (context: GcsExtensionRouteContext): string => {
  const agencyId = context.params.agencyId
  if (!agencyId) throw userError('invalid')
  return agencyId
}
export const credentialSummary = async (context: GcsExtensionRouteContext) => {
  const secret = await getEncryptedExtensionSecret(context.db as never, { rootKey: rootKey(), extensionKey: EXTENSION_KEY, ownerType: 'agency', ownerId: owner(context), secretKey: CREDENTIAL_SECRET_KEY })
  return { configured: secret !== null && CredentialSchema.safeParse(secret).success }
}
export const saveCredential = async (context: GcsExtensionRouteContext) => {
  const parsed = CredentialSchema.safeParse(await context.readBody())
  if (!parsed.success) throw userError('credentialsInvalid')
  const agencyId = owner(context)
  const auth = context.writeAuthorization
  if (!auth) throw new Error('GC Notify credential writes require transaction authorization')
  const database = context.db as unknown as Kysely<ConfigurationDatabase>
  await database.transaction().execute(async trx => {
    await auth.lockAuthState(trx)
    await lockGcsExtensionLifecycleScope(trx as never, EXTENSION_KEY, agencyId)
    await (auth.authorizeCurrentScope ?? auth.authorizeCurrentEntity)(trx)
    const config = await trx.selectFrom('extensions.agency_enablement').select('enabled').where('agency_id', '=', agencyId).where('extension_key', '=', EXTENSION_KEY).where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!config?.enabled) throw userError('disabled', 409)
    await createGcNotifyClient(parsed.data.apiKey, AbortSignal.timeout(15_000)).listTemplates()
    await setEncryptedExtensionSecret(trx as never, { rootKey: rootKey(), extensionKey: EXTENSION_KEY, ownerType: 'agency', ownerId: agencyId, secretKey: CREDENTIAL_SECRET_KEY, value: parsed.data, metadata: { configured: true } })
  })
  return { configured: true }
}
export const listTemplates = async (context: GcsExtensionRouteContext) => {
  const streamId = context.params.streamId
  if (!streamId) throw userError('invalid')
  const captured = z.object({ agencyId: z.string().min(1), streamId: z.string().min(1) }).safeParse(context.stream)
  const authorized = context.authorizedScope
  if (!captured.success || captured.data.streamId !== streamId || authorized?.type !== 'entity' || captured.data.agencyId !== authorized.agencyId) throw userError('scopeChanged', 403)
  const stream = await resolveExtensionStreamContext(context.db as never, streamId)
  if (!stream) throw userError('invalid', 404)
  const current = stream.scope
  if (stream.agencyId !== captured.data.agencyId || current.type !== 'entity' || current.agencyId !== authorized.agencyId || current.path.length !== authorized.path.length || current.path.some((part, index) => part.type !== authorized.path[index]?.type || part.id !== authorized.path[index]?.id)) throw userError('scopeChanged', 403)
  const credential = await loadCredential(context.db, captured.data.agencyId)
  return { templates: await createGcNotifyClient(credential.apiKey, AbortSignal.timeout(15_000)).listTemplates() }
}
