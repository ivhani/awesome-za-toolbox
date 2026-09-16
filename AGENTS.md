# AGENTS.md - Awesome ZA Toolbox

## Project Shape

This is a Node.js/TypeScript pnpm monorepo for `awesome-za-toolbox`.

- Public npm package: `apps/cli`, published as `za-toolbox`
- Private internal packages:
  - `packages/core`
  - `packages/schemas`
  - `packages/pdf-utils`
  - `packages/fnb`
  - `packages/ejoburg`

The CLI should stay thin. Parser logic belongs in packages so it can later be reused by an SDK, desktop app, or other projects.

## Core Product Rules

- Local-first by default.
- No telemetry.
- No cloud upload of user documents.
- No AI processing of private documents unless the user explicitly opts in.
- Parser-only MVP: no portal login, scraping, downloading, credential storage, or browser automation in v1.
- Future desktop app should live in `apps/desktop` and call the same parser packages directly.

## Sensitive Data Rules

This repo may be tested against real bank and municipal PDFs, but real user documents must never be committed.

Never commit:

- Real PDFs
- Raw extracted statement text from real documents
- Account numbers, addresses, names, IDs, balances, or transaction details from real statements
- `.run_state/` outputs

Fixtures must be synthetic or anonymized.

## Parser Rules

Parsers should expose SDK-style functions, not CLI-only behavior.

Preferred shape:

```ts
parse(input: { filePath: string }): Promise<ParseResult<T>>
```

Parsers should return structured results with:

- `ok`
- `data`
- `errors`
- `warnings`
- `metadata`

Do not throw for ordinary parse failures. Return structured parse errors unless the failure is truly unexpected.

## Output Schema Rules

Use shared schemas from `packages/schemas`.

FNB parsers should return normalized `BankStatement`.

eJoburg/COJ parsers should return normalized `MunicipalStatement`.

Keep institution-specific parsing details inside the relevant package.

## CLI Rules

The CLI must import parser packages. Do not duplicate parser logic in `apps/cli`.

Supported public commands:

```bash
za-toolbox bank fnb parse <pdf> --format json|csv --output <path>
za-toolbox municipal ejoburg parse <pdf> --format json|csv --output <path>
```

## Release Rules

`za-toolbox` is published from `apps/cli`.

npm trusted publishing is configured for:

- GitHub repo: `ivhani/awesome-za-toolbox`
- Workflow: `release-za-toolbox.yml`

Do not republish an existing version. For releases:

1. Bump `apps/cli/package.json`
2. Commit and push
3. Tag with `za-toolbox-vX.Y.Z`
4. Push the tag

## Verification

Before committing parser or CLI changes, run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Parser changes should include tests using synthetic or anonymized fixtures.
