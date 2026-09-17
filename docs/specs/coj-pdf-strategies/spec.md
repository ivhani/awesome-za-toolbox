# COJ PDF Extraction Strategies Spec

## Objective

Replace the eJoburg parser's ordered text-to-XFA fallback with three independent peer extraction strategies for City of Johannesburg PDFs:

- standard PDF text extraction,
- XFA dataset extraction,
- layout-aware positioned text extraction for flattened LiveCycle/AEM tax invoices.

The public command remains:

```bash
za-toolbox municipal ejoburg parse <pdf> --format json|csv --output <path>
```

## Approved Behavior

- The normal single-file parse path runs all three strategies independently.
- Each strategy returns a standard result envelope with strategy identity, success or failure, optional parsed `MunicipalStatement`, warnings, errors, and provenance safe for review.
- The parser retains every per-strategy result in structured metadata.
- If successful strategies materially agree, the parser consolidates deterministically into the ordinary `MunicipalStatement` output.
- If only one strategy succeeds, the parser returns that statement and preserves other strategy failures as diagnostics.
- If successful strategies materially disagree, the parser marks the result for review and does not silently choose a winner.
- If every strategy fails, the parser returns a structured failure.
- The parser never invents missing values.

## Layout-Aware Scope

The layout-aware strategy targets flattened COJ tax invoices where useful text is present as positioned page text but ordinary extraction can split headings and fields across awkward ordering. It must parse:

- split COJ tax-invoice headings,
- account, period, balance, payment, and amount-due fields,
- charge categories and category rows,
- VAT lines,
- reconciliation checks.

## Boundaries

- No workbook or batch parsing behavior.
- No dependency on the local COJ workbook proof of concept.
- No Python, Poppler, OCR, cloud service, browser automation, portal access, or system-level runtime dependency.
- Node/npm dependencies are acceptable when they are production dependencies of the package that uses them.
- Real private PDFs, raw extracted private text, account numbers, addresses, names, balances, and transaction details must not be committed.
- Fixtures must be synthetic or sanitized.

## Acceptance Criteria

- Feature work is isolated in a clean worktree and branch based directly on latest `origin/main`.
- No workbook POC files or workbook dependencies appear in the diff.
- Tests exercise all three strategies independently with one or two representative documents or fixtures each.
- Tests cover consolidation agreement, single-success, all-fail, and disagreement/review behavior.
- Existing standard text and XFA behavior remains passing.
- The layout-aware strategy extracts and parses selected local private PDFs without OCR or system dependencies.
- `pnpm typecheck`, `pnpm test`, `pnpm build`, and production dependency audit pass.
- The implementation is committed, pushed, and opened as a focused pull request to `main`.

