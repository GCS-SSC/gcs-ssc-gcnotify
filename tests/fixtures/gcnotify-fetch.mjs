/** Explicit server-process fixture for managed public-contract browser journeys. Never imported by production code. */
// Deliberately synthetic UUIDs. This key is assembled locally and has never been issued by GC Notify.
const syntheticServiceId = '11111111-1111-4111-8111-111111111111'
const syntheticKeyId = '22222222-2222-4222-8222-222222222222'
export const apiKey = ['gcntfy', 'browser-fixture', syntheticServiceId, syntheticKeyId].join('-')
export const templateId = '33333333-3333-4333-8333-333333333333'
const template = { id: templateId, name: 'Approval required / Approbation requise', type: 'email', personalisation: { recipient: { required: true }, reference: { required: true }, link: { required: true } } }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
export const fixtureFetch = original => async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (url.origin !== 'https://api.notification.canada.ca') return await original(input, options)
  const headers = new Headers(options?.headers ?? (input instanceof Request ? input.headers : undefined))
  if (headers.get('authorization') !== `ApiKey-v1 ${apiKey}`) return json({ errors: [{ message: 'Invalid fixture key' }] }, 403)
  if (url.pathname === '/v2/templates' && url.searchParams.get('type') === 'email') return json({ templates: [template] })
  if (url.pathname === `/v2/template/${templateId}`) return json(template)
  if (url.pathname === '/v2/notifications' && url.searchParams.has('reference')) return json({ notifications: [] })
  throw new Error(`Unexpected GC Notify fixture request: ${url.pathname}`)
}
// NODE_OPTIONS is inherited by build/runner child processes. Only the isolated app server receives the fixture.
if (process.argv.some(argument => /(?:^|\/)\.output\/server\/index\.mjs$/.test(argument))) globalThis.fetch = fixtureFetch(globalThis.fetch)
