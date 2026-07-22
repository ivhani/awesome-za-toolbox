# Security

## Privacy boundary

Awesome ZA Toolbox is local-first software. The current project does not include telemetry, cloud upload, external AI processing, portal login, scraping, credential storage, or browser automation.

Future AI/OCR integrations must be explicit opt-in features. Local providers should be preferred by default. Remote providers are allowed only when the user names the provider, supplies credentials or configuration intentionally, and can see from documentation that document data leaves the machine.

## Sensitive data

Do not share real statements, credentials, cookies, personal details, account numbers, municipal references, or screenshots in public issues or pull requests. Use synthetic examples or heavily anonymized extracts.

Provider documentation must state whether files, extracted text, images, or metadata are sent to a third party.

## Reporting vulnerabilities

If you find a security or privacy issue, avoid opening a public issue with sensitive details. Contact the maintainer privately first, or open a minimal public issue that says a private security report is needed without including exploit details or private data.

## Supported versions

The project is pre-1.0. Security fixes are applied to the latest `main` branch until versioned releases are established.
