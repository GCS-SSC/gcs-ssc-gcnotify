# GCS-SSC GC Notify extension

Agency Managers connect GCS-SSC approval notifications to [GC Notify](https://notification.canada.ca/). The host decides whose approval turn is active and owns the durable queue. This extension owns email template discovery, personalisation mapping, encrypted credentials and GC Notify API calls. It provides no delivery-reporting UI.

## Configure the Agency key

1. Enable **GC Notify** in the Agency's Extensions section and select it as the Agency's notification provider.
2. Open its Agency configuration, enter a GC Notify API key, and choose **Save API key**. A template-list request validates the key before replacing the encrypted saved secret.

The Agency editor contains only credential status, a password input, and Save. A blank password keeps the saved key. Agency configuration contains no template or mapping values. The browser receives only whether a key is configured.

## Map Stream notifications

1. Enable **GC Notify** in the owning Transfer Payment Stream's Extensions section.
2. Choose **Configure** to open the existing full-page Stream configuration. The page lists the host notifiers, including those without a template mapping.
3. Choose the **Edit** icon in a notifier’s Actions column. The large dialog loads GC Notify email templates asynchronously. Explicitly select the host email field used for the recipient, select a template by name and map every required placeholder to one of that notifier's host fields. Field choices use the host's bilingual groups, such as System and Approval. Language-sensitive names, dates and times require an explicit English or French choice for each placeholder. Date and time fields also require an explicit IANA time zone; neither choice is inferred or selected automatically.
4. Choose **Save** in the dialog. Repeat for other notifiers as needed. Different notifiers can use the same template, while each notifier has one template per Stream.

The main page uses the same table layout as Agreements. Template and placeholder controls appear only in the selected notifier's dialog. Opening the page does not request remote templates. A failed template request can be retried in the dialog; an unavailable saved template must be replaced, or unlinked from the main table. Cancel or dismissal discards the local draft. Mapped notifier rows provide a separate red unlink icon in Actions. Its confirmation removes only that notifier’s mapping immediately; cancelling leaves configuration unchanged. The edit dialog has no unlink action. The recipient must explicitly map to an email-typed host field. Missing mappings and empty resolved addresses prevent sending; there is no default or fallback. Save persists the mappings and closes the dialog after success; a failed save keeps the draft and associated field errors open. Template wording, bilingual content, and branding remain managed in GC Notify. Only email is supported.

Stream configuration stores `mappings: [{ templateId, notifierId, recipientEmail, personalisation }]`. Placeholder keys map to host field identifiers for text, or `{ fieldId, locale }` for language-sensitive text and `{ fieldId, timeZone, locale }` for dates and times. Existing strings and `{ fieldId, timeZone }` mappings remain readable so their language can be repaired explicitly. The host formats date and time values with the selected English or French medium Intl style in the selected zone, using the same notification-admission instant. Agency, program and Stream names use the explicitly selected language. The initial host notifier is `approval.action_required`; its catalog supplies `recipient_name`, `item_reference`, `item_title`, and `approval_url`. Other host notifier and field choices come from the host catalog rather than an extension-owned list. Unmapped notifiers send nothing. Each Stream must explicitly enable and configure the provider; Agency configuration is never a mapping fallback.

Agency Managers manage the key. Stream Managers configure their Stream without needing Agency read access. The template endpoint resolves the Stream's owning Agency server-side and never returns credentials. Host-managed configuration and encrypted secret records retain host audit ownership; the extension creates no tables.

## Delivery and recovery

The API origin is fixed at `https://api.notification.canada.ca`; credentials cannot be redirected to a configured endpoint. Requests use the documented `ApiKey-v1` authorization scheme, reject redirects, and carry a cancellation signal. Use a test key for development; team and live keys can send real email.

Before a send, the host durably records the opaque reference and the extension's nonsecret service identity and SHA-256 key fingerprint. The extension checks the latest email template's required placeholders before sending. Explicit unprocessed API errors are classified separately from uncertain outcomes. Successful submission means accepted, not delivered.

If the response is lost or malformed, recovery queries GC Notify by the same reference. A matching message confirms acceptance. GC Notify buffers sends before status records become visible, so an empty query is always inconclusive and never authorizes another send. Recovery can use a rotated key for the same service; different services remain inconclusive. After seven days, recovery stays unresolved. There is no regular status polling after known acceptance and no reporting screen; administrators use GC Notify itself.

Notifications are sent only while the host confirms the recipient still has the active approval turn and this provider remains enabled. Configuration repairs can resume pending work. Events originally created without a provider or mapping do not replay after later configuration.

See the official [connection](https://documentation.notification.canada.ca/en/start.html), [sending](https://documentation.notification.canada.ca/en/send.html) and [status](https://documentation.notification.canada.ca/en/status.html) contracts.

## Development

This is an independent public extension workspace. Its published SDK dependency is a built release artifact; it does not import the application or private tooling. From this repository:

```sh
bun install
bun run typecheck
bun run test:unit
bun run test:coverage
```

Unit tests exercise the real SDK entrypoints, extension editor/catalog, API request shapes, encrypted-secret handoff, fresh authorization ordering, template validation, rejection handling and ambiguous-send recovery. Coverage thresholds are 80% for lines, statements, branches and functions.

`tests/fixtures/gcnotify-fetch.mjs` is a managed-browser transport fixture. Run an isolated host browser journey with `NODE_OPTIONS=--import=/absolute/path/to/tests/fixtures/gcnotify-fetch.mjs`. The fixture activates only for the host's `.output/server/index.mjs`, delegates unrelated requests, and rejects unexpected GC Notify operations.

Template A, **Approval required / Approbation requise**, requires all 16 placeholders below. Template B, **Alternate approval / Autre approbation**, requires only `recipient`, `reference`, and `link`.

Choose `recipient_email`, labelled **Assigned approver email**, for the required `recipientEmail` mapping. That choice determines the destination address independently of the `recipient` content placeholder. For an unclaimed group approval, the field resolves to the assigned group mailbox. For a user assignment or claimed group approval, it resolves to that user's email. `recipient_name` supplies the group's name in the selected language or the assigned user's name. Map the template placeholders as follows:

| Placeholder | Host field | Explicit language | Explicit time zone |
| --- | --- | --- | --- |
| `recipient` | `recipient_name` | English | Not used |
| `reference` | `item_reference` | Not used | Not used |
| `link` | `approval_url` | Not used | Not used |
| `date_en` | `today_date` | English | `America/Toronto` |
| `date_fr` | `today_date` | Français | `UTC` |
| `time_en` | `current_time` | English | `America/Toronto` |
| `time_fr` | `current_time` | Français | `UTC` |
| `agency_en` | `agency_name` | English | Not used |
| `agency_fr` | `agency_name` | Français | Not used |
| `program_en` | `program_name` | English | Not used |
| `program_fr` | `program_name` | Français | Not used |
| `stream_en` | `stream_name` | English | Not used |
| `stream_fr` | `stream_name` | Français | Not used |
| `agreement` | `agreement_number` | Not used | Not used |
| `assigned_name` | `recipient_name` | Français | Not used |
| `assigned_email` | `recipient_email` | Not used | Not used |

`assigned_name` and `assigned_email` are fixture template placeholders, not additional host fields.

Each placeholder keeps its host field, language, and time zone on one horizontal row, including narrow screens. Select each language and time zone explicitly in the editor. Placeholder suffixes do not set those choices. Text and email values use field-ID strings. Language-sensitive text uses `{ fieldId, locale }`, and dates and times use `{ fieldId, locale, timeZone }`.

The fixture exports a synthetic API key that cannot send email. For a complete host queue journey, set `GCS_E2E_NOTIFICATION_TRACE` to an isolated temporary file. The fixture validates every required placeholder and records only the approved public payload, without authorization headers or API keys. It returns an accepted notification ID. The managed runner owns trace cleanup. Fixture verification does not send a live GC Notify message.
