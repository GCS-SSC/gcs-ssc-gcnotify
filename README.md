# GCS-SSC GC Notify extension

Agency Managers connect GCS-SSC approval notifications to [GC Notify](https://notification.canada.ca/). The host decides whose approval turn is active and owns the durable queue. This extension owns email template discovery, personalisation mapping, encrypted credentials and GC Notify API calls. It provides no delivery-reporting UI.

## Configure

1. Enable **GC Notify** in the Agency's Extensions section and save its configuration. Select it as that Agency's notification provider.
2. Enter a GC Notify API key and choose **Save API key**. A template-list request validates the key before replacing the encrypted saved secret. The browser receives only whether a key is configured.
3. Choose **Load email templates**, select a bilingual email template, and map every required placeholder to a host notifier field. Save the extension configuration.

The initial notifier is `approval.action_required`. Its supported fields are `recipient_name`, `item_reference`, `item_title`, and `approval_url`. Leave the template unmapped to send nothing for that notifier. Template wording, bilingual content and branding remain managed in GC Notify. Only email is supported; SMS requires a future recipient-contact contract.

The host requires Agency Manager authority for configuration and credential/template endpoints. Transfer Payment Streams cannot override Agency notification configuration. Host-managed configuration and encrypted secret records retain host audit ownership; the extension creates no tables.

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

`tests/fixtures/gcnotify-fetch.mjs` is an explicit managed-browser transport fixture. Run an isolated host browser journey with `NODE_OPTIONS=--import=/absolute/path/to/tests/fixtures/gcnotify-fetch.mjs`. It activates only for the host's `.output/server/index.mjs`, delegates unrelated requests, and rejects unexpected GC Notify operations. It supplies one bilingual template with required `recipient`, `reference` and `link` placeholders; map them to `recipient_name`, `item_reference` and `approval_url`. The fixture API key is exported in that file, is synthetic, and cannot send email. For a complete host queue journey, set `GCS_E2E_NOTIFICATION_TRACE` to an isolated temporary file. The fixture validates email submissions, records the public payload without authorization headers or API keys, and returns an accepted notification ID. The managed runner owns trace cleanup. Fixture-backed verification is separate from a live GC Notify delivery test.
