import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'

/** Explicit server-process fixture for managed public-contract browser journeys. Never imported by production code. */
// Deliberately synthetic UUIDs. This key is assembled locally and has never been issued by GC Notify.
const syntheticServiceId = '11111111-1111-4111-8111-111111111111'
const syntheticKeyId = '22222222-2222-4222-8222-222222222222'
export const apiKey = ['gcntfy', 'browser-fixture', syntheticServiceId, syntheticKeyId].join('-')
export const templateId = '33333333-3333-4333-8333-333333333333'
export const alternateTemplateId = '55555555-5555-4555-8555-555555555555'
const basicPersonalisation = { recipient: { required: true }, reference: { required: true }, link: { required: true } }
const template = { id: templateId, name: 'Approval required / Approbation requise', type: 'email', personalisation: { ...basicPersonalisation, ...Object.fromEntries(['date_toronto', 'date_utc', 'time_utc', 'agency', 'stream', 'agreement', 'assigned_name', 'assigned_email'].map(name => [name, { required: true }])) } }
const alternateTemplate = { ...template, id: alternateTemplateId, name: 'Alternate approval / Autre approbation', personalisation: basicPersonalisation }
const templates = [template, alternateTemplate]
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
export const fixtureFetch = original => {
  const accepted = new Map()
  return async (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    if (url.origin !== 'https://api.notification.canada.ca') return await original(input, options)
    const headers = new Headers(options?.headers ?? (input instanceof Request ? input.headers : undefined))
    if (headers.get('authorization') !== `ApiKey-v1 ${apiKey}`) return json({ errors: [{ message: 'Invalid fixture key' }] }, 403)
    const method = options?.method ?? (input instanceof Request ? input.method : 'GET')
    if (method === 'GET' && url.pathname === '/v2/templates' && url.searchParams.get('type') === 'email') return json({ templates })
    if (method === 'GET' && url.pathname.startsWith('/v2/template/')) {
      const found = templates.find(item => url.pathname === `/v2/template/${item.id}`)
      if (found) return json(found)
    }
    if (method === 'GET' && url.pathname === '/v2/notifications' && url.searchParams.has('reference')) {
      const found = accepted.get(url.searchParams.get('reference'))
      return json({ notifications: found ? [found] : [] })
    }
    if (method === 'POST' && url.pathname === '/v2/notifications/email') {
      const body = JSON.parse(options?.body ?? (input instanceof Request ? await input.text() : '{}'))
      const selectedTemplate = templates.find(item => item.id === body?.template_id)
      const required = Object.keys(selectedTemplate?.personalisation ?? {})
      if (!body || typeof body.email_address !== 'string' || !body.email_address.includes('@') || !selectedTemplate || typeof body.reference !== 'string' || !body.reference || !body.personalisation || required.some(name => typeof body.personalisation[name] !== 'string')) return json({ errors: [{ message: 'Invalid fixture email payload' }] }, 400)
      const tracePath = process.env.GCS_E2E_NOTIFICATION_TRACE
      if (!tracePath) throw new Error('GC Notify send fixture requires an isolated trace path')
      const notificationId = randomUUID()
      const payload = { email_address: body.email_address, template_id: body.template_id, reference: body.reference, personalisation: Object.fromEntries(required.map(name => [name, body.personalisation[name]])) }
      appendFileSync(tracePath, `${JSON.stringify({ method, path: url.pathname, body: payload, notificationId })}\n`, { mode: 0o600 })
      accepted.set(body.reference, { id: notificationId, reference: body.reference })
      return json({ id: notificationId, reference: body.reference }, 201)
    }
    throw new Error(`Unexpected GC Notify fixture request: ${url.pathname}`)
  }
}
// NODE_OPTIONS is inherited by build/runner child processes. Only the isolated app server receives the fixture.
if (process.argv.some(argument => /(?:^|\/)\.output\/server\/index\.mjs$/.test(argument))) globalThis.fetch = fixtureFetch(globalThis.fetch)
