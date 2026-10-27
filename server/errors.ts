import { createGcsExtensionUserError } from '@gcs-ssc/extensions/server'
import { localized, messages } from '../i18n/messages.ts'
export const userError = (key: keyof typeof messages.en, statusCode = 400, path?: string) => createGcsExtensionUserError({ code: `GCS_GCNOTIFY_${key.toUpperCase()}`, message: localized(key), statusCode, ...(path ? { details: [{ path, code: `GCS_GCNOTIFY_${key.toUpperCase()}`, message: localized(key) }] } : {}) })
