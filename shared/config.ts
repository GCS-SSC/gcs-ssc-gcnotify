import { z } from 'zod'

export const EXTENSION_KEY = 'gcs-ssc-gcnotify'
export const CREDENTIAL_SECRET_KEY = 'api-key'
export const StreamMappingSchema = z.object({
  templateId: z.uuid(),
  notifierId: z.string().trim().min(1).max(128),
  personalisation: z.record(z.string().min(1).max(512), z.string().min(1).max(128))
}).strict()
export const AgencyConfigSchema = z.object({}).strict()
export const StreamConfigSchema = z.object({ mappings: z.array(StreamMappingSchema).default([]) }).strict().superRefine((value, context) => {
  const seen = new Set<string>()
  value.mappings.forEach((mapping, index) => {
    if (seen.has(mapping.notifierId)) context.addIssue({ code: 'custom', path: ['mappings', index, 'notifierId'], message: 'Duplicate notification notifier.' })
    seen.add(mapping.notifierId)
  })
})
export type StreamConfig = z.infer<typeof StreamConfigSchema>
export type StreamMapping = z.infer<typeof StreamMappingSchema>
export const CredentialSchema = z.object({ apiKey: z.string().trim().max(1024).regex(/^gcntfy-.+-[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}-[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i) }).strict()
