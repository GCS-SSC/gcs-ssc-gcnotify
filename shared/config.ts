import { z } from 'zod'

export const EXTENSION_KEY = 'gcs-ssc-gcnotify'
export const CREDENTIAL_SECRET_KEY = 'api-key'
export const isValidTimeZone = (value: string): boolean => {
  if (/^[+-]/.test(value)) return false
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false }
}
const FieldIdSchema = z.string().min(1).max(128)
const LocaleSchema = z.enum(['en', 'fr'])
export const FieldMappingSchema = z.union([
  FieldIdSchema,
  z.object({ fieldId: FieldIdSchema, locale: LocaleSchema }).strict(),
  z.object({ fieldId: FieldIdSchema, timeZone: z.string().max(128), locale: LocaleSchema }).strict(),
  z.object({ fieldId: FieldIdSchema, timeZone: z.string().max(128) }).strict()
])
export const StreamMappingSchema = z.object({
  templateId: z.uuid(),
  notifierId: z.string().trim().min(1).max(128),
  recipientEmail: z.string().min(1).max(128).optional(),
  personalisation: z.record(z.string().min(1).max(512), FieldMappingSchema)
}).strict()
export const AgencyConfigSchema = z.object({}).strict()
export const StreamConfigSchema = z.object({ mappings: z.array(StreamMappingSchema).default([]) }).strict().superRefine((value, context) => {
  const seen = new Set<string>()
  value.mappings.forEach((mapping, index) => {
    if (seen.has(mapping.notifierId)) context.addIssue({ code: 'custom', path: ['mappings', index, 'notifierId'], message: 'Duplicate notification notifier.' })
    seen.add(mapping.notifierId)
  })
})
export const configurationErrorPath = (error: z.ZodError): string | undefined => {
  const issue = error.issues[0]
  if (!issue) return undefined
  if (issue.code === 'unrecognized_keys' && issue.keys.includes('locale')) return [...issue.path, 'locale'].map(String).join('.')
  const localeIssue = issue.code === 'invalid_union' ? issue.errors.flat().find(item => item.code === 'invalid_value' && item.path[0] === 'locale') : undefined
  return [...issue.path, ...(localeIssue?.path ?? [])].map(String).join('.')
}
export type StreamConfig = z.infer<typeof StreamConfigSchema>
export type StreamMapping = z.infer<typeof StreamMappingSchema>
export const CredentialSchema = z.object({ apiKey: z.string().trim().max(1024).regex(/^gcntfy-.+-[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}-[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i) }).strict()
