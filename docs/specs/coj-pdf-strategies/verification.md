# COJ PDF Extraction Strategies Verification

## Automated Verification

- `pnpm typecheck` passed after the semantic-validation fix.
- `pnpm test` passed: 30 tests, 30 passing after the semantic-validation fix.
- `pnpm build` passed after the semantic-validation fix.
- `pnpm audit --prod` passed with no known vulnerabilities after the semantic-validation fix.

The repeated pdf.js `standardFontDataUrl` warning was resolved by supplying the installed package's standard-font directory. Synthetic XFA tests still emit invalid-hex warnings from their deliberately minimal PDF construction; these do not occur in the live layout corpus and do not affect test results.

## Private Live Validation

Two representative private PDFs and the complete approved 20-PDF corpus were validated locally from the 100 Jorissen raw eJoburg folder:

- Representative statements: both parsed successfully; consolidation status `single-success`; layout-aware succeeded; standard text failed semantic validation; XFA reported no dataset; reconciliation passed.
- Complete corpus: 20 of 20 produced usable consolidated statements, 0 required review, and all 20 reconciliation checks passed.
- Strategy pattern across all 20: layout-aware was the sole successful strategy; standard text was rejected with `EJOBURG_STRATEGY_MISSING_BALANCES`; XFA returned `PDF_XFA_DATASET_NOT_FOUND`.
- Five statements contained an interest-on-arrears summary charge. Parsing that charge separately resolved their initial balance-reconciliation failures without weakening validation.

No private PDFs were copied into the repository. No raw extracted private text, account details, names, addresses, balances, or transaction values were committed.

## Scope Check

- No workbook POC files were added.
- No workbook, spreadsheet, Excel, or batch-processing dependency was added.
- The only new runtime dependency is `pdfjs-dist` in `@awesome-za/pdf-utils`, used for Node/npm-only positioned text extraction.

## Remaining Limitations

- Layout-aware parsing supports the observed flattened COJ tax-invoice family and synthetic regression shape; unrelated flattened municipal layouts may still return structured failures.
- The public CSV output remains the consolidated municipal statement. Per-strategy diagnostics are available in JSON metadata.
