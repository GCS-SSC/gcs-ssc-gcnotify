import { defineGcsExtensionMessages, translateGcsExtensionMessage } from '@gcs-ssc/extensions'
export const messages = defineGcsExtensionMessages({
  en: {
    apiKey: 'GC Notify API key', keyHelp: 'Enter a key to save or replace credentials. Leave this field blank to keep the saved key.', saveKey: 'Save API key', keySaved: 'API key saved.', keyConfigured: 'An API key is configured.', keyMissing: 'No API key is configured.',
    saveFirst: 'Enable and save the extension configuration before saving credentials or loading templates.',
    template: 'Bilingual email template', load: 'Load email templates', mapping: 'Host field for {placeholder}', notifier: 'Approval action required',
    saved: 'Saved.', failed: 'Unable to complete the request. Check the API key and GC Notify service, then retry.',
    invalid: 'The GC Notify configuration is invalid.', credentialsInvalid: 'Enter a valid GC Notify API key.', unavailable: 'The GC Notify service is unavailable. Check its configuration and try again.',
    disabled: 'Enable the GC Notify extension before configuring it.', requiredMapping: 'Map every required GC Notify template placeholder to a supported host notifier field.',
    recipient_name: 'Recipient name', item_reference: 'Item reference', item_title: 'Item title', approval_url: 'Approval link',
    noMapping: 'No notification (unmapped)', help: 'Manage bilingual email content in GC Notify. Save the extension configuration after choosing a template and mapping its placeholders.'
  },
  fr: {
    apiKey: 'Clé API de Notification GC', keyHelp: 'Entrez une clé pour enregistrer ou remplacer les identifiants. Laissez ce champ vide pour conserver la clé enregistrée.', saveKey: 'Enregistrer la clé API', keySaved: 'Clé API enregistrée.', keyConfigured: 'Une clé API est configurée.', keyMissing: 'Aucune clé API n’est configurée.',
    saveFirst: 'Activez et enregistrez la configuration de l’extension avant d’enregistrer les identifiants ou de charger les modèles.',
    template: 'Modèle de courriel bilingue', load: 'Charger les modèles de courriel', mapping: 'Champ de l’application pour {placeholder}', notifier: 'Approbation requise',
    saved: 'Enregistré.', failed: 'Impossible de terminer la demande. Vérifiez la clé API et le service Notification GC, puis réessayez.',
    invalid: 'La configuration de Notification GC n’est pas valide.', credentialsInvalid: 'Entrez une clé API de Notification GC valide.', unavailable: 'Le service Notification GC n’est pas disponible. Vérifiez sa configuration et réessayez.',
    disabled: 'Activez l’extension Notification GC avant de la configurer.', requiredMapping: 'Associez chaque variable obligatoire du modèle Notification GC à un champ pris en charge de l’application.',
    recipient_name: 'Nom du destinataire', item_reference: 'Référence de l’élément', item_title: 'Titre de l’élément', approval_url: 'Lien d’approbation',
    noMapping: 'Aucune notification (non associé)', help: 'Gérez le contenu bilingue des courriels dans Notification GC. Enregistrez la configuration de l’extension après avoir choisi un modèle et associé ses variables.'
  }
})
export const localized = (key: keyof typeof messages.en) => ({
  en: translateGcsExtensionMessage(messages, 'en', key), fr: translateGcsExtensionMessage(messages, 'fr', key)
})
