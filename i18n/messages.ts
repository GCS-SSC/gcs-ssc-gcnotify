import { defineGcsExtensionMessages, translateGcsExtensionMessage } from '@gcs-ssc/extensions'
export const messages = defineGcsExtensionMessages({
  en: {
    scopeChanged: 'The Stream ownership changed. Reload its configuration before trying again.', saveFailed: 'Notification mappings could not be saved.', chooseNotifier: 'Choose a host notifier', removeMapping: 'Remove mapping', actions: 'Actions', hostNotifier: 'Host notifier', configureMapping: 'Configure mapping', configureTemplate: 'Configure {template}', saveMappings: 'Save notification mappings', streamHelp: 'Choose an email template, associate it with a host notifier, then map its required placeholders. The API key is managed by your Agency.', streamDisabled: 'Enable GC Notify for this Stream before loading templates or saving mappings.', templateUnavailable: 'This saved template is unavailable. Reload templates or remove its notifier mapping.', apiKey: 'GC Notify API key', keyHelp: 'Enter a key to save or replace credentials. Leave this field blank to keep the saved key.', saveKey: 'Save API key', keySaved: 'API key saved.', keyConfigured: 'An API key is configured.', keyMissing: 'No API key is configured.',
    saveFirst: 'Enable and save the extension before saving credentials.',
    template: 'Bilingual email template', load: 'Load email templates', mapping: 'Host field for {placeholder}',
    saved: 'Saved.', failed: 'Unable to complete the request. Check the API key and GC Notify service, then retry.',
    invalid: 'The GC Notify configuration is invalid.', credentialsInvalid: 'Enter a valid GC Notify API key.', unavailable: 'The GC Notify service is unavailable. Check its configuration and try again.',
    disabled: 'Enable the GC Notify extension before configuring it.', requiredMapping: 'Map every required GC Notify template placeholder to a supported host notifier field.',
    noMapping: 'No notification (unmapped)'
  },
  fr: {
    scopeChanged: 'Le propriétaire du volet a changé. Rechargez sa configuration avant de réessayer.', saveFailed: 'Impossible d’enregistrer les correspondances de notification.', chooseNotifier: 'Choisissez une notification de l’application', removeMapping: 'Supprimer la correspondance', actions: 'Actions', hostNotifier: 'Notification de l’application', configureMapping: 'Configurer', configureTemplate: 'Configurer {template}', saveMappings: 'Enregistrer', streamHelp: 'Choisissez un modèle de courriel, associez-le à une notification de l’application, puis associez ses variables obligatoires. Votre organisation gère la clé API.', streamDisabled: 'Activez Notification GC pour ce volet avant de charger les modèles ou d’enregistrer les correspondances.', templateUnavailable: 'Ce modèle enregistré n’est pas disponible. Rechargez les modèles ou supprimez son association à une notification.', apiKey: 'Clé API de Notification GC', keyHelp: 'Entrez une clé pour enregistrer ou remplacer les identifiants. Laissez ce champ vide pour conserver la clé enregistrée.', saveKey: 'Enregistrer la clé API', keySaved: 'Clé API enregistrée.', keyConfigured: 'Une clé API est configurée.', keyMissing: 'Aucune clé API n’est configurée.',
    saveFirst: 'Activez et enregistrez l’extension avant d’enregistrer les identifiants.',
    template: 'Modèle de courriel bilingue', load: 'Charger les modèles de courriel', mapping: 'Champ de l’application pour {placeholder}',
    saved: 'Enregistré.', failed: 'Impossible de terminer la demande. Vérifiez la clé API et le service Notification GC, puis réessayez.',
    invalid: 'La configuration de Notification GC n’est pas valide.', credentialsInvalid: 'Entrez une clé API de Notification GC valide.', unavailable: 'Le service Notification GC n’est pas disponible. Vérifiez sa configuration et réessayez.',
    disabled: 'Activez l’extension Notification GC avant de la configurer.', requiredMapping: 'Associez chaque variable obligatoire du modèle Notification GC à un champ pris en charge de l’application.',
    noMapping: 'Aucune notification (non associé)'
  }
})
export const localized = (key: keyof typeof messages.en) => ({
  en: translateGcsExtensionMessage(messages, 'en', key), fr: translateGcsExtensionMessage(messages, 'fr', key)
})
