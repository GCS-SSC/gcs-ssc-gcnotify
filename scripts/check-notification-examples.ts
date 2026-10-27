import { readFileSync, writeFileSync } from 'node:fs'
import { documentationStart, documentationEnd, renderNotificationExampleDocumentation } from './notification-documentation'

const path = new URL('../README.md', import.meta.url)
const readme = readFileSync(path, 'utf8')
const start = readme.indexOf(documentationStart)
const end = readme.indexOf(documentationEnd)
if (start < 0 || end < start) throw new Error('README needs the notification mapping example markers')
const updated = `${readme.slice(0, start)}${renderNotificationExampleDocumentation()}${readme.slice(end + documentationEnd.length)}`
if (process.argv.includes('--write')) writeFileSync(path, updated)
else if (updated !== readme) throw new Error('Notification examples are stale. Run bun scripts/check-notification-examples.ts --write')
