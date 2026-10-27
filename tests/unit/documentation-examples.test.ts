import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { documentationStart, documentationEnd, loadNotificationExamples, renderNotificationExampleDocumentation } from '../../scripts/notification-documentation'

describe('public notification mapping examples', () => {
  it('keeps the README examples generated from the executable public mappings', () => {
    const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8')
    const start = readme.indexOf(documentationStart)
    const end = readme.indexOf(documentationEnd)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    expect(readme.slice(start, end + documentationEnd.length)).toBe(renderNotificationExampleDocumentation())
  })
  it('returns independent example data for callers that construct invalid or legacy variants', () => {
    const first = loadNotificationExamples()
    const mapping = first.A.config.mappings[0]
    expect(mapping).toBeDefined()
    if (!mapping) throw new Error('Example A requires its authored mapping')
    mapping.personalisation.recipient = 'changed-by-caller'
    expect(loadNotificationExamples().A.config.mappings[0]?.personalisation.recipient).toEqual({ fieldId: 'recipient_name', locale: 'en' })
  })
})
