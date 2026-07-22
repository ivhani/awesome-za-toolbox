# Awesome ZA Toolbox

Local-first, open-source tools for converting South African documents into clean data.

## MVP status

This repository currently contains parser-only tooling:

- FNB bank statement PDF to normalized JSON or CSV
- eJoburg municipal statement PDF to normalized JSON or CSV
- One published CLI package: `za-toolbox`
- Private workspace packages that can later become `@awesome-za/*` public packages

No portal login, scraping, browser automation, credential storage, telemetry, or external AI processing is included.

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

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

The project targets Node.js `>=22.14.0` for npm trusted publishing compatibility.

## Privacy rules

- Real bank or municipal statements must not be committed.
- Test data must be synthetic or anonymized.
- Document contents are not logged by default.
- Parsers return warnings and reconciliation metadata instead of claiming perfect accuracy.
