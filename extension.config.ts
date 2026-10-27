import { defineGcsAuditOwnership, defineGcsExtension } from '@gcs-ssc/extensions'
export default defineGcsExtension({
  key: 'gcs-ssc-gcnotify', sdkVersion: '^0.3.21', configurationAccess: 'manager', configurationScope: 'agency',
  name: { en: 'GC Notify', fr: 'Notification GC' },
  description: { en: 'Sends Agency approval notifications using bilingual GC Notify email templates.', fr: 'Envoie les notifications d’approbation de l’organisation avec les modèles de courriel bilingues de Notification GC.' },
  requiredHostCapabilities: ['agency-only-configuration', 'configuration-access', 'audit-ownership', 'agency-config', 'extension-ui', 'extension-api-client', 'host-api-client', 'server-handlers', 'server-handler-rbac', 'extension-secrets', 'extension-lifecycle-hooks', 'notification-provider'],
  auditOwnership: defineGcsAuditOwnership([]),
  admin: { agency: { path: './components/AgencyGcNotifyConfig.vue' } },
  notificationProvider: { adapter: { path: './server/notification-adapter.ts' } },
  nitroPlugin: './server/plugins/configuration-guard.ts',
  serverHandlers: [
    { route: '/agencies/[agencyId]/credentials', method: 'get', rbac: { subject: 'agency', action: 'delete', agency: { param: 'agencyId' } }, path: './server/api/credentials.get.ts' },
    { route: '/agencies/[agencyId]/credentials', method: 'put', rbac: { subject: 'agency', action: 'delete', agency: { param: 'agencyId' } }, path: './server/api/credentials.put.ts' },
    { route: '/agencies/[agencyId]/templates', method: 'get', rbac: { subject: 'agency', action: 'delete', agency: { param: 'agencyId' } }, path: './server/api/templates.get.ts' }
  ]
})
