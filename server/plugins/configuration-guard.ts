import { defineGcsExtensionNitroPlugin, registerGcsExtensionConfigurationGuard, type GcsExtensionConfigurationGuardContext } from '@gcs-ssc/extensions/server'
import { AgencyConfigSchema, StreamConfigSchema, EXTENSION_KEY, isValidTimeZone, configurationErrorPath } from '../../shared/config.ts'
import { loadCredential } from '../credentials.ts'
import { createGcNotifyClient } from '../gcnotify.ts'
import { userError } from '../errors.ts'

export const validateConfiguration = async (context: GcsExtensionConfigurationGuardContext): Promise<void> => {
  if (context.extensionKey !== EXTENSION_KEY || context.targetExtensionKey !== EXTENSION_KEY || !context.enabled || context.config === undefined) return
  if (context.scope === 'agency') {
    if (!AgencyConfigSchema.safeParse(context.config).success) throw userError('invalid')
    return
  }
  const parsed = StreamConfigSchema.safeParse(context.config)
  if (!parsed.success) throw userError('invalid', 400, configurationErrorPath(parsed.error))
  if (!context.streamId) throw userError('invalid')
  if (parsed.data.mappings.length === 0) return
  for (const [index, mapping] of parsed.data.mappings.entries()) {
    const notifier = context.notificationNotifiers?.find(item => item.id === mapping.notifierId)
    if (!notifier) throw userError('invalid', 400, `mappings.${index}.notifierId`)
    if (!mapping.recipientEmail || !notifier.fields.some(field => field.id === mapping.recipientEmail && field.type === 'email')) throw userError('recipientRequired', 400, `mappings.${index}.recipientEmail`)
    for (const [placeholder, field] of Object.entries(mapping.personalisation)) {
      const metadata = notifier.fields.find(item => item.id === (typeof field === 'string' ? field : field.fieldId))
      const path = `mappings.${index}.personalisation.${placeholder}`
      if (!metadata) throw userError('invalid', 400, path)
      if ((metadata.type === 'text' || metadata.type === 'email') && typeof field !== 'string') throw userError('invalid', 400, path)
      if ((metadata.type === 'date' || metadata.type === 'time') && (typeof field === 'string' || !('timeZone' in field) || !isValidTimeZone(field.timeZone))) throw userError('timeZoneRequired', 400, `${path}.timeZone`)
      if (metadata.type !== 'text' && metadata.type !== 'email' && (typeof field === 'string' || !('locale' in field))) throw userError('localeRequired', 400, `${path}.locale`)
      if (metadata.type === 'localized-text' && typeof field === 'object' && 'timeZone' in field) throw userError('invalid', 400, path)
    }
  }
  const credential = await loadCredential(context.db, context.agencyId)
  const client = createGcNotifyClient(credential.apiKey, AbortSignal.timeout(15_000))
  for (const [index, mapping] of parsed.data.mappings.entries()) {
    const template = await client.getTemplate(mapping.templateId)
    const missing = template.requiredPersonalisation.find(name => !Object.hasOwn(mapping.personalisation, name))
    if (missing) throw userError('requiredMapping', 400, `mappings.${index}.personalisation.${missing}`)
  }


}
export default defineGcsExtensionNitroPlugin(app => {
  registerGcsExtensionConfigurationGuard(EXTENSION_KEY, validateConfiguration, app)
})
