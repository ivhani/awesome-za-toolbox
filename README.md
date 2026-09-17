# Awesome ZA Toolbox

Local-first, open-source tools for converting South African documents into clean data.

## MVP status

This repository currently contains parser-only tooling:

- FNB bank statement PDF to normalized JSON or CSV
- eJoburg municipal statement PDF to normalized JSON or CSV
- One published CLI package: `za-toolbox`
- Private workspace packages that can later become `@awesome-za/*` public packages

No portal login, scraping, browser automation, credential storage, telemetry, or external AI processing is included.

## Future AI/OCR support

AI-assisted OCR may be added later for scanned PDFs, broken text extraction, table reconstruction, and parser fallback. The intended design is provider-neutral and opt-in: no AI processing happens by default, and any future remote provider must require explicit user configuration.

The first named model example is Baidu's `baidu/Unlimited-OCR` on Hugging Face, but the project should not lock itself to one OCR model. See [AI/OCR Roadmap](docs/roadmap/ai-ocr.md).

## Usage

```bash
pnpm install
pnpm build

pnpm --filter za-toolbox start -- bank fnb parse ./statement.pdf --format json --output statement.json
pnpm --filter za-toolbox start -- municipal ejoburg parse ./invoice.pdf --format csv --output invoice.csv
```

Once published:

```bash
npx za-toolbox bank fnb parse ./statement.pdf --format json --output statement.json
```

## Private fixture workflow

Real statements must stay out of git. For local parser hardening, place anonymized PDFs under the ignored `fixtures/private/` directory:

```bash
mkdir -p fixtures/private/extracted
pnpm --filter za-toolbox start -- dev extract-text fixtures/private/fnb-sample-1.pdf --output fixtures/private/extracted/fnb-sample-1.txt
```

Review the extracted text manually, remove all personal information, then commit only a sanitized text fixture if it is useful for tests.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

The project targets Node.js `>=22.14.0` for npm trusted publishing compatibility.

## Publishing

The first public package is `za-toolbox`. Internal `@awesome-za/*` workspace packages are private in v1 and bundled into the CLI package at build time.

Publishing is automated with Release Please and GitHub trusted publishing. Feature pull requests use Conventional Commit titles such as `feat: add a parser` or `fix: handle an empty statement`; feature branches do not edit package versions.

After releasable changes land on `main`, Release Please opens or updates a dedicated release pull request. Merging that pull request bumps the public package version, updates the changelog, creates the `za-toolbox-vX.Y.Z` tag and GitHub release, runs the full verification suite, and publishes the package to npm.

## Privacy rules

- Real bank or municipal statements must not be committed.
- Test data must be synthetic or anonymized.
- Document contents are not logged by default.
- Parsers return warnings and reconciliation metadata instead of claiming perfect accuracy.
