import { defineGcsAuditOwnership, defineGcsExtension } from '@gcs-ssc/extensions'
export default defineGcsExtension({
  key: 'gcs-ssc-gcnotify', sdkVersion: '^0.3.25', configurationAccess: 'manager',
  name: { en: 'GC Notify', fr: 'Notification GC' },
  description: { en: 'Sends Agency approval notifications using bilingual GC Notify email templates.', fr: 'Envoie les notifications d’approbation de l’organisation avec les modèles de courriel bilingues de Notification GC.' },
  requiredHostCapabilities: ['configuration-access', 'audit-ownership', 'agency-config', 'stream-config-page', 'extension-ui', 'extension-api-client', 'host-api-client', 'server-handlers', 'server-handler-rbac', 'extension-secrets', 'extension-lifecycle-hooks', 'notification-provider'],
  auditOwnership: defineGcsAuditOwnership([]),
  admin: { agency: { path: './components/AgencyGcNotifyConfig.vue' }, streamConfigPage: { path: './components/StreamGcNotifyConfig.vue' } },
  notificationProvider: { adapter: { path: './server/notification-adapter.ts' } },
  nitroPlugin: './server/plugins/configuration-guard.ts',
  serverHandlers: [
    { route: '/agencies/[agencyId]/credentials', method: 'get', rbac: { subject: 'agency', action: 'delete', agency: { param: 'agencyId' } }, path: './server/api/credentials.get.ts' },
    { route: '/agencies/[agencyId]/credentials', method: 'put', rbac: { subject: 'agency', action: 'delete', agency: { param: 'agencyId' } }, path: './server/api/credentials.put.ts' },
    { route: '/streams/[streamId]/templates', method: 'get', rbac: { subject: 'transfer_payment', action: 'delete', stream: { param: 'streamId' } }, path: './server/api/templates.get.ts' }
  ]
})
