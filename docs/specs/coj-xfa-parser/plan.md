# COJ XFA Parser Plan

## Design

1. Extend `packages/pdf-utils` with a local `extractPdfXfaDataset(filePath)` helper.
   - Reuse the same PDF readability and header checks as text extraction.
   - Scan PDF streams.
   - Decode Flate-compressed streams when possible.
   - Return the first embedded XFA dataset XML block.

2. Extend `packages/ejoburg`.
   - Keep `parseEjoburgStatementText` as the default text parser.
   - Add an internal XFA parser that normalizes supported `Bill` datasets to `MunicipalStatement`.
   - Attempt XFA only when text parsing hits the Adobe dynamic-form placeholder or when no PDF text was extractable.
   - Reuse `buildChecks`, `checksToWarnings`, money rounding, and `okResult` / `errorResult`.

3. Add tests with synthetic fixtures.
   - Add a synthetic XFA PDF helper that embeds compressed XFA XML.
   - Add unit coverage for parser success, parser failures, reconciliation warnings, and PDF XFA extraction.
   - Add a CLI JSON test to prove the existing command path inherits XFA support.

## Non-Goals

- No workbook-specific parsing code.
- No new external production dependency unless unavoidable.
- No real document fixtures.
- No generalized XML parser beyond the supported XFA shape.

## Verification

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod
```
