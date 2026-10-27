import { defineGcsExtensionRouteHandler } from '@gcs-ssc/extensions/server'
import { listTemplates } from '../credentials.ts'
export default defineGcsExtensionRouteHandler(listTemplates)
