import { defineGcsExtensionNitroPlugin, registerGcsExtensionConfigurationGuard, type GcsExtensionConfigurationGuardContext } from '@gcs-ssc/extensions/server'
import { AgencyConfigSchema, EXTENSION_KEY } from '../../shared/config.ts'
import { loadCredential } from '../credentials.ts'
import { createGcNotifyClient } from '../gcnotify.ts'
import { userError } from '../errors.ts'

export const validateConfiguration = async (context: GcsExtensionConfigurationGuardContext): Promise<void> => {
  if (context.extensionKey !== EXTENSION_KEY || context.targetExtensionKey !== EXTENSION_KEY || context.scope !== 'agency' || !context.enabled || context.config === undefined) return
  const parsed = AgencyConfigSchema.safeParse(context.config)
  if (!parsed.success) throw userError('invalid')
  const mapping = parsed.data.mappings['approval.action_required']
  if (!mapping) return
  const credential = await loadCredential(context.db, context.agencyId)
  const template = await createGcNotifyClient(credential.apiKey, AbortSignal.timeout(15_000)).getTemplate(mapping.templateId)
  if (template.requiredPersonalisation.some(name => !Object.hasOwn(mapping.personalisation, name))) throw userError('requiredMapping')
}
export default defineGcsExtensionNitroPlugin(app => {
  registerGcsExtensionConfigurationGuard(EXTENSION_KEY, validateConfiguration, app)
})
