import { z } from 'zod'

export const EXTENSION_KEY = 'gcs-ssc-gcnotify'
export const CREDENTIAL_SECRET_KEY = 'api-key'
export const HOST_FIELDS = ['recipient_name', 'item_reference', 'item_title', 'approval_url'] as const
export const MappingSchema = z.object({
  templateId: z.uuid(),
  personalisation: z.record(z.string().min(1).max(512), z.enum(HOST_FIELDS))
}).strict()
export const AgencyConfigSchema = z.object({
  mappings: z.object({ 'approval.action_required': MappingSchema.optional() }).strict().default({})
}).strict()
export type AgencyConfig = z.infer<typeof AgencyConfigSchema>
export const parseAgencyConfig = (value: unknown): AgencyConfig => AgencyConfigSchema.parse(value)
export const CredentialSchema = z.object({ apiKey: z.string().trim().max(1024).regex(/^gcntfy-.+-[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}-[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i) }).strict()
