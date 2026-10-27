import { defineGcsNotificationProviderAdapter, type GcsNotificationProviderContext } from '@gcs-ssc/extensions/server'
import { AgencyConfigSchema, StreamConfigSchema, CREDENTIAL_SECRET_KEY, CredentialSchema, configurationErrorPath } from '../shared/config.ts'
import { createGcNotifyClient, deliveryIdentity, matchesDeliveryIdentity } from './gcnotify.ts'
import { userError } from './errors.ts'

const keyFor = async (context: GcsNotificationProviderContext): Promise<string> => {
  const value = CredentialSchema.safeParse(await context.secrets.get(CREDENTIAL_SECRET_KEY))
  if (!value.success) throw userError('credentialsInvalid', 409)
  return value.data.apiKey
}
export default defineGcsNotificationProviderAdapter({
  validateAgencyConfig: config => {
    const parsed = AgencyConfigSchema.safeParse(config)
    if (!parsed.success) throw userError('invalid', 400, configurationErrorPath(parsed.error))
    return parsed.data
  },
  validateStreamConfig: config => {
    const parsed = StreamConfigSchema.safeParse(config)
    if (!parsed.success) throw userError('invalid', 400, configurationErrorPath(parsed.error))
    return parsed.data
  },
  resolveMapping: ({ streamConfig, notifierId }) => {
    const parsed = StreamConfigSchema.safeParse(streamConfig)
    if (!parsed.success) throw userError('invalid', 400, configurationErrorPath(parsed.error))
    const mapping = parsed.data.mappings.find(item => item.notifierId === notifierId)
    return mapping ? { templateId: mapping.templateId, ...(mapping.recipientEmail === undefined ? {} : { recipientEmail: mapping.recipientEmail }), personalisation: mapping.personalisation } : null
  },
  prepareDelivery: async context => deliveryIdentity(await keyFor(context)),
  listTemplates: async context => await createGcNotifyClient(await keyFor(context), context.signal).listTemplates(),
  getTemplate: async context => await createGcNotifyClient(await keyFor(context), context.signal).getTemplate(context.templateId),
  send: async context => {
    // Credential resolution happens before any external delivery request.
    const key = await keyFor(context).catch(() => null)
    if (!key) return { kind: 'rejected', retryable: true }
    if (!matchesDeliveryIdentity(context.deliveryContext, key)) return { kind: 'rejected', retryable: false }
    const client = createGcNotifyClient(key, context.signal)
    // No POST has occurred if current-template validation fails.
    const template = await client.getTemplate(context.templateId).catch(() => null)
    if (!template) return { kind: 'rejected', retryable: true }
    if (template.requiredPersonalisation.some(name => !Object.hasOwn(context.personalisation, name))) return { kind: 'rejected', retryable: false }
    return await client.send(context)
  },
  recover: async context => {
    const age = Date.now() - Date.parse(context.attemptedAt)
    if (!Number.isFinite(age) || age < 0 || age >= 7 * 24 * 60 * 60 * 1000) return { kind: 'inconclusive' }
    const key = await keyFor(context)
    if (!matchesDeliveryIdentity(context.deliveryContext, key, 'service')) return { kind: 'inconclusive' }
    return await createGcNotifyClient(key, context.signal).recover(context.reference)
  }
})
