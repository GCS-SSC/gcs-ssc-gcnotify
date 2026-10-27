# GCS-SSC GC Notify extension

Agency Managers connect GCS-SSC approval notifications to [GC Notify](https://notification.canada.ca/). The host decides whose approval turn is active and owns the durable queue. This extension owns email template discovery, personalisation mapping, encrypted credentials and GC Notify API calls. It provides no delivery-reporting UI.

## Configure the Agency key

1. Enable **GC Notify** in the Agency's Extensions section and select it as the Agency's notification provider.
2. Open its Agency configuration, enter a GC Notify API key, and choose **Save API key**. A template-list request validates the key before replacing the encrypted saved secret.

The Agency editor contains only credential status, a password input, and Save. A blank password keeps the saved key. Agency configuration contains no template or mapping values. The browser receives only whether a key is configured.

## Map Stream notifications

1. Enable **GC Notify** in the owning Transfer Payment Stream's Extensions section.
2. Choose **Configure** to open the existing full-page Stream configuration. The page lists the host notifiers, including those without a template mapping.
3. Choose the **Edit** icon in a notifier’s Actions column. The medium dialog loads GC Notify email templates asynchronously. Select a template by name and map every required placeholder to one of that notifier's host fields. Field choices use the host's bilingual groups, such as System and Approval. Date and time fields require an explicit IANA time zone for each placeholder; no zone is chosen automatically.
4. Choose **Save** in the dialog. Repeat for other notifiers as needed. Different notifiers can use the same template, while each notifier has one template per Stream.

The main page uses the same table layout as Agreements. Template and placeholder controls appear only in the selected notifier's dialog. Opening the page does not request remote templates. A failed template request can be retried in the dialog; an unavailable saved template must be replaced, or unlinked from the main table. Cancel or dismissal discards the local draft. Mapped notifier rows provide a separate red unlink icon in Actions. Its confirmation removes only that notifier’s mapping immediately; cancelling leaves configuration unchanged. The edit dialog has no unlink action. Save persists the mappings and closes the dialog after success; a failed save keeps the draft and associated field errors open. Template wording, bilingual content, and branding remain managed in GC Notify. Only email is supported.

Stream configuration stores `mappings: [{ templateId, notifierId, personalisation }]`. Placeholder keys map to host field identifiers for text, or `{ fieldId, timeZone }` for date and time values. The host formats date values as `YYYY-MM-DD` and time values as 24-hour `HH:mm:ss` in the selected zone, using the same notification-admission instant. The initial host notifier is `approval.action_required`; its catalog supplies `recipient_name`, `item_reference`, `item_title`, and `approval_url`. Other host notifier and field choices come from the host catalog rather than an extension-owned list. Unmapped notifiers send nothing. Each Stream must explicitly enable and configure the provider; Agency configuration is never a mapping fallback.

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

`tests/fixtures/gcnotify-fetch.mjs` is an explicit managed-browser transport fixture. Run an isolated host browser journey with `NODE_OPTIONS=--import=/absolute/path/to/tests/fixtures/gcnotify-fetch.mjs`. It activates only for the host's `.output/server/index.mjs`, delegates unrelated requests, and rejects unexpected GC Notify operations. It supplies two bilingual templates with required `recipient`, `reference` and `link` placeholders; map them to `recipient_name`, `item_reference` and `approval_url`. The fixture API key is exported in that file, is synthetic, and cannot send email. For a complete host queue journey, set `GCS_E2E_NOTIFICATION_TRACE` to an isolated temporary file. The fixture validates email submissions, records the public payload without authorization headers or API keys, and returns an accepted notification ID. The managed runner owns trace cleanup. Fixture-backed verification is separate from a live GC Notify delivery test.
