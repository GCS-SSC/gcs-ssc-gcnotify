import { defineGcsExtensionRouteHandler } from '@gcs-ssc/extensions/server'
import { credentialSummary } from '../credentials.ts'
export default defineGcsExtensionRouteHandler(credentialSummary)
