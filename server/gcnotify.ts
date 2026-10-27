import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { GcsNotificationTemplate } from '@gcs-ssc/extensions'
import { CredentialSchema } from '../shared/config.ts'
import { userError } from './errors.ts'

export const GC_NOTIFY_ORIGIN = 'https://api.notification.canada.ca'
const TemplateSchema = z.object({
  id: z.uuid(), name: z.string(), type: z.literal('email'),
  personalisation: z.record(z.string(), z.object({ required: z.boolean() }))
})
const TemplateListSchema = z.object({ templates: z.array(TemplateSchema) })
const DeliveryIdentitySchema = z.object({ serviceId: z.uuid(), apiKeyFingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
const AcceptedSchema = z.object({ id: z.uuid() })
const NotificationListSchema = z.object({ notifications: z.array(z.object({ id: z.uuid(), reference: z.string().nullable() })) })
export type DeliveryIdentity = z.infer<typeof DeliveryIdentitySchema>
export const deliveryIdentity = (apiKey: string): DeliveryIdentity => {
  const key = CredentialSchema.parse({ apiKey }).apiKey
  return { serviceId: key.slice(-73, -37), apiKeyFingerprint: createHash('sha256').update(key).digest('hex') }
}
const asTemplate = (value: z.infer<typeof TemplateSchema>): GcsNotificationTemplate => ({
  id: value.id, name: value.name, kind: 'email',
  requiredPersonalisation: Object.entries(value.personalisation).filter(([, field]) => field.required).map(([name]) => name)
})
export const createGcNotifyClient = (apiKey: string, signal: AbortSignal) => {
  const key = CredentialSchema.parse({ apiKey }).apiKey
  const request = async (path: string, body?: unknown) => await fetch(`${GC_NOTIFY_ORIGIN}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `ApiKey-v1 ${key}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal, redirect: 'error'
  })
  const read = async (path: string): Promise<unknown> => {
    const response = await request(path)
    if (!response.ok) throw userError('unavailable', 503)
    return await response.json()
  }
  return {
    listTemplates: async () => TemplateListSchema.parse(await read('/v2/templates?type=email')).templates.map(asTemplate),
    getTemplate: async (id: string) => asTemplate(TemplateSchema.parse(await read(`/v2/template/${z.uuid().parse(id)}`))),
    send: async (input: { templateId: string; recipientEmail: string; personalisation: Record<string, string>; reference: string }) => {
      const response = await request('/v2/notifications/email', {
        email_address: z.email().parse(input.recipientEmail), template_id: z.uuid().parse(input.templateId),
        personalisation: input.personalisation, reference: input.reference
      })
      if (!response.ok) {
        // GC Notify documents these responses as requests it did not process.
        if (response.status >= 400 && response.status <= 599) return { kind: 'rejected' as const, retryable: response.status === 429 || response.status >= 500 }
        throw userError('unavailable', 503)
      }
      return { kind: 'accepted' as const, notificationId: AcceptedSchema.parse(await response.json()).id }
    },
    recover: async (reference: string) => {
      const result = NotificationListSchema.parse(await read(`/v2/notifications?reference=${encodeURIComponent(reference)}&template_type=email`))
      const found = result.notifications.find(notification => notification.reference === reference)
      // Buffered sends may be accepted before appearing here; an empty list never proves absence.
      return found ? { kind: 'found' as const, notificationId: found.id } : { kind: 'inconclusive' as const }
    }
  }
}
export const matchesDeliveryIdentity = (value: unknown, apiKey: string, scope: 'service' | 'key' = 'key'): boolean => {
  const parsed = DeliveryIdentitySchema.safeParse(value)
  if (!parsed.success) return false
  const current = deliveryIdentity(apiKey)
  return parsed.data.serviceId === current.serviceId && (scope === 'service' || parsed.data.apiKeyFingerprint === current.apiKeyFingerprint)
}
