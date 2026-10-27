import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { StreamConfigSchema } from '../shared/config'

const ExampleSchema = z.object({ name: z.string(), config: StreamConfigSchema })
export const loadNotificationExamples = () => z.object({ extensionKey: z.string(), A: ExampleSchema, B: ExampleSchema }).parse(
  JSON.parse(readFileSync(new URL('../examples/notification-mappings.json', import.meta.url), 'utf8'))
)
export const documentationStart = '<!-- notification-mapping-examples:start -->'
export const documentationEnd = '<!-- notification-mapping-examples:end -->'
export const renderNotificationExampleDocumentation = (): string => {
  const examples = loadNotificationExamples()
  const sections = [documentationStart, 'This example block is generated from `examples/notification-mappings.json`. Run `bun scripts/check-notification-examples.ts --write` to update it.']
  for (const key of ['A', 'B'] as const) {
    const example = examples[key]
    const mapping = example.config.mappings[0]
    if (!mapping) throw new Error(`Example ${key} needs a mapping`)
    sections.push(`### Template ${key}: ${example.name}`, `Template ID: \`${mapping.templateId}\`. Host notifier: \`${mapping.notifierId}\`. Required recipient field: \`${mapping.recipientEmail}\`.`,
      '| Placeholder | Host field | Explicit language | Explicit time zone |', '| --- | --- | --- | --- |')
    for (const [placeholder, binding] of Object.entries(mapping.personalisation)) {
      const field = typeof binding === 'string' ? binding : binding.fieldId
      const language = typeof binding !== 'string' && 'locale' in binding ? binding.locale === 'en' ? 'English' : 'Français' : 'Not used'
      const zone = typeof binding !== 'string' && 'timeZone' in binding ? `\`${binding.timeZone}\`` : 'Not used'
      sections.push(`| \`${placeholder}\` | \`${field}\` | ${language} | ${zone} |`)
    }
  }
  return `${sections.join('\n\n').replaceAll('|\n\n|', '|\n|')}\n${documentationEnd}`
}
