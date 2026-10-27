import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiKey, templateId, alternateTemplateId, fixtureFetch } from '../fixtures/gcnotify-fetch.mjs'
const origin = 'https://api.notification.canada.ca'
const auth = { Authorization: `ApiKey-v1 ${apiKey}` }
const dirs = []
afterEach(() => { vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
describe('managed browser transport fixture', () => {
  it('delegates unrelated traffic and rejects invalid auth or unexpected provider operations', async () => {
    const original = vi.fn().mockResolvedValue(new Response('unchanged'))
    const fetcher = fixtureFetch(original)
    expect(await (await fetcher('https://example.ca')).text()).toBe('unchanged')
    expect(original).toHaveBeenCalledOnce()
    expect((await fetcher(`${origin}/v2/templates?type=email`)).status).toBe(403)
    await expect(fetcher(`${origin}/unexpected`, { headers: auth })).rejects.toThrow('Unexpected GC Notify fixture request')
  })
  it('serves email template metadata and records only the accepted public payload', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gcnotify-trace-')); dirs.push(dir)
    const tracePath = join(dir, 'trace.ndjson'); vi.stubEnv('GCS_E2E_NOTIFICATION_TRACE', tracePath)
    const fetcher = fixtureFetch(vi.fn())
    expect((await (await fetcher(`${origin}/v2/templates?type=email`, { headers: auth })).json()).templates[0].id).toBe(templateId)
    expect((await (await fetcher(`${origin}/v2/template/${alternateTemplateId}`, { headers: auth })).json()).name).toBe('Alternate approval / Autre approbation')
    expect((await (await fetcher(`${origin}/v2/template/${templateId}`, { headers: auth })).json()).personalisation).toHaveProperty('link')
    const body = { email_address: 'synthetic@example.ca', template_id: templateId, reference: 'gcs-ssc:test', personalisation: { recipient: 'Synthetic', reference: 'TEST', link: 'https://example.ca/en/home' }, ignored: 'must not be logged' }
    const result = await fetcher(`${origin}/v2/notifications/email`, { method: 'POST', headers: auth, body: JSON.stringify(body) })
    expect(result.status).toBe(201)
    const sent = await result.json()
    const trace = readFileSync(tracePath, 'utf8')
    expect(trace).not.toContain(apiKey); expect(trace).not.toContain('Authorization'); expect(trace).not.toContain('must not be logged')
    expect(JSON.parse(trace)).toEqual({ method: 'POST', path: '/v2/notifications/email', notificationId: sent.id, body: { email_address: body.email_address, template_id: templateId, reference: body.reference, personalisation: body.personalisation } })
    const recovered = await fetcher(`${origin}/v2/notifications?reference=${encodeURIComponent(body.reference)}`, { headers: auth })
    expect(await recovered.json()).toEqual({ notifications: [{ id: sent.id, reference: body.reference }] })
    expect(await (await fetcher(`${origin}/v2/notifications?reference=absent`, { headers: auth })).json()).toEqual({ notifications: [] })
    expect((await fetcher(`${origin}/v2/notifications/email`, { method: 'POST', headers: auth, body: '{}' })).status).toBe(400)
  })
  it('requires an isolated trace path before accepting fixture email', async () => {
    vi.stubEnv('GCS_E2E_NOTIFICATION_TRACE', '')
    const body = { email_address: 'synthetic@example.ca', template_id: templateId, reference: 'test', personalisation: { recipient: 'Synthetic', reference: 'TEST', link: 'https://example.ca' } }
    await expect(fixtureFetch(vi.fn())(`${origin}/v2/notifications/email`, { method: 'POST', headers: auth, body: JSON.stringify(body) })).rejects.toThrow('isolated trace path')
  })
})
