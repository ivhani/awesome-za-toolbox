# COJ PDF Extraction Strategies Verification

## Automated Verification

- `pnpm typecheck` passed.
- `pnpm test` passed: 27 tests, 27 passing.
- `pnpm build` passed.
- `pnpm audit --prod` passed with no known vulnerabilities.

The test run includes pdf.js warnings from synthetic PDF/font handling. These warnings did not prevent extraction, parsing, build output, or live validation.

## Private Live Validation

Two approved private PDFs were validated locally from the 100 Jorissen raw eJoburg folder:

- January 2026 statement: parse succeeded; consolidation status `single-success`; layout-aware strategy succeeded; standard text and XFA strategies failed independently; reconciliation check passed.
- March 2026 statement: parse succeeded; consolidation status `single-success`; layout-aware strategy succeeded; standard text and XFA strategies failed independently; reconciliation check passed.

No private PDFs were copied into the repository. No raw extracted private text, account details, names, addresses, balances, or transaction values were committed.

## Scope Check

- No workbook POC files were added.
- No workbook, spreadsheet, Excel, or batch-processing dependency was added.
- The only new runtime dependency is `pdfjs-dist` in `@awesome-za/pdf-utils`, used for Node/npm-only positioned text extraction.

## Remaining Limitations

- Layout-aware parsing supports the observed flattened COJ tax-invoice family and synthetic regression shape; unrelated flattened municipal layouts may still return structured failures.
- The public CSV output remains the consolidated municipal statement. Per-strategy diagnostics are available in JSON metadata.
